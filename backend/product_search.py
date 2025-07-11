from mcp.server.fastmcp import FastMCP
from dotenv import load_dotenv
from langchain.schema import Document
from langchain_community.vectorstores import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain.prompts import PromptTemplate
from langchain.chains import RetrievalQA
from tabulate import tabulate
import os, json

load_dotenv()
mcp = FastMCP("ProductAgent")

# ----------------- Globals ------------------------------------ #
_vectordb = None  # cache vector db for reuse


# ----------------- Helpers ------------------------------------ #
def load_products() -> list[dict]:
    with open("products.json") as f:
        return json.load(f)


def docs_from_products(products: list[dict]) -> list[Document]:
    return [
        Document(
            page_content=(
                f"{p['name']}. {p.get('description','')}. "
                f"Category: {p['category']}. "
                f"Price: ₹{p['price']}. "
                f"In‑stock: {p.get('inStock', True)}."
                f" Rating: {p.get('rating', 'N/A')}."
                f" Reviews: {p.get('reviews', 'N/A')}."
            ),
            metadata=p,
        )
        for p in products
    ]


def get_vectordb():
    global _vectordb
    if _vectordb is None:
        products = load_products()
        docs = docs_from_products(products)
        embeddings = GoogleGenerativeAIEmbeddings(
            model="models/embedding-001",
            google_api_key=os.getenv("GOOGLE_API_KEY"),
        )
        _vectordb = Chroma.from_documents(
            docs, embedding=embeddings, persist_directory="./chroma_products"
        )
    return _vectordb


def qa_chain(vdb):
    prompt = PromptTemplate.from_template(
        """
You are a helpful ecommerce assistant. **Answer ONLY from the context**.
If the answer is not in context say:
"I’m sorry, I don’t see that information yet."

Context:
---------
{context}

Question: {question}
---------
Answer (markdown):
"""
    )
    return RetrievalQA.from_chain_type(
        llm=ChatGoogleGenerativeAI(model="gemini-2.0-flash", temperature=0),
        retriever=vdb.as_retriever(),
        chain_type="stuff",
        chain_type_kwargs={"prompt": prompt},
    )


# ------------------ TOOL 1: Semantic Q&A ------------------------ #
@mcp.tool()
def search_products(query: str) -> str:
    """
    Search over the product catalog to find matches for the user's query.
    Returns product name, price, and availability.
    """
    print("[ProductAgent] query →", query)
    vectordb = get_vectordb()
    qa = qa_chain(vectordb)
    answer = qa.run(query)

    if "I’m sorry" in answer:
        return "Sorry, I couldn't find any relevant products in our catalog."

    return answer


# ------------------ TOOL 2: Filter Products --------------------- #
@mcp.tool()
def filter_products(
    category: str = "",
    min_price: float = 0,
    max_price: float = 1e9,
    in_stock_only: bool = False,
) -> list:
    """
    Return products matching category / price / availability filters.
    Example: category="Electronics", max_price=2000, in_stock_only=True
    """
    products = load_products()
    results = [
        p for p in products
        if category.lower() in p["category"].lower()
        and min_price <= p["price"] <= max_price
        and (p.get("inStock", True) or not in_stock_only)
    ]
    return results or [{"message": "No products match those filters."}]


# ------------------ TOOL 3: RAG Compare Products ---------------- #
@mcp.tool()
def compare_products(product_names: list[str]) -> str:
    """
    Compare two or more products using RAG.
    Returns a markdown table with their main fields.
    """
    vectordb = get_vectordb()
    chosen = []

    for phrase in product_names:
        match = vectordb.similarity_search(phrase, k=1)
        if match:
            chosen.append(match[0].metadata)

    if len(chosen) < 2:
        return "I couldn’t find enough matching products to compare."

    headers = ["Name", "Price ₹", "Rating ⭐", "Reviews", "In Stock"]
    rows = [
        [
            p["name"],
            p["price"],
            p.get("rating", "N/A"),
            p.get("reviews", "N/A"),
            "✅" if p.get("inStock", False) else "❌",
        ]
        for p in chosen
    ]

    return "### Product comparison\n\n" + tabulate(rows, headers=headers, tablefmt="github")


# ------------------ TOOL 4: Availability ------------------------ #
@mcp.tool()
def check_availability(product_name: str) -> dict:
    """
    Check if a product is in stock (uses the inStock field).
    """
    for p in load_products():
        if product_name.lower() in p["name"].lower():
            return {
                "product": p["name"],
                "available": p.get("inStock", False),
                "price": p["price"],
                "message": (
                    f"{p['name']} is available for ₹{p['price']}."
                    if p.get("inStock", False)
                    else f"Sorry, {p['name']} is currently out of stock."
                ),
            }
    return {"error": "Product not found."}


# ------------------ TOOL 5: Policies & FAQ ---------------------- #
@mcp.tool()
def get_policy_info(topic: str) -> str:
    """
    Answer common policy questions. Topics: return, refund, shipping, warranty.
    """
    faq = {
        "return": "You can return items within 30 days of delivery.",
        "refund": "Refunds are processed in 5‑7 business days after inspection.",
        "shipping": "Standard shipping is 3‑5 business days; express is 1‑2.",
        "warranty": "Most electronics include a 1‑year manufacturer warranty.",
    }
    return faq.get(topic.lower(), "I have no information on that topic.")


# ------------------ Start MCP server ---------------------------- #
if __name__ == "__main__":
    print("[ProductAgent] tool-server starting…")
    mcp.run(transport="stdio")
