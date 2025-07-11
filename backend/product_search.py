from mcp.server.fastmcp import FastMCP
from dotenv import load_dotenv
from langchain.schema import Document
from langchain_community.vectorstores import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain.prompts import PromptTemplate
from langchain.chains import RetrievalQA
from tabulate import tabulate
from pymongo import MongoClient
import os, json

load_dotenv()
mcp = FastMCP("ProductAgent")

# ---------------- MongoDB setup ---------------- #
def mongo_client() -> MongoClient:
    host = os.getenv("MONGO_HOST", "localhost")
    port = int(os.getenv("MONGO_PORT", 27017))
    user = os.getenv("MONGO_USER", "admin")
    pwd  = os.getenv("MONGO_PASS", "password")
    uri  = f"mongodb://{user}:{pwd}@{host}:{port}/?authSource=admin"
    return MongoClient(uri)

try:
    db = mongo_client()["contoso"]
    # Test connection
    db.command("ping")
    print("[MongoDB] Connected successfully")
except Exception as e:
    print(f"[MongoDB] Connection failed: {e}")
    db = None

# ---------------- Globals ---------------- #
_vectordb = None
_current_user_cache = {}  # email -> user_doc cache

# ---------------- Vector DB Setup ---------------- #
def load_products() -> list[dict]:
    try:
        with open("products.json") as f:
            return json.load(f)
    except FileNotFoundError:
        print("[WARNING] products.json not found, creating sample data")
        # Create sample products if file doesn't exist
        sample_products = [
        ]
        # Save sample data
        with open("products.json", "w") as f:
            json.dump(sample_products, f, indent=2)
        return sample_products

def docs_from_products(products: list[dict]) -> list[Document]:
    return [
        Document(
            page_content=(
                f"{p['name']}. {p.get('description','')}. "
                f"Category: {p['category']}. Price: ₹{p['price']}. "
                f"In‑stock: {p.get('inStock', True)}. "
                f"Rating: {p.get('rating','N/A')}. Reviews: {p.get('reviews','N/A')}."
            ),
            metadata=p,
        )
        for p in products
    ]

def get_vectordb():
    global _vectordb
    if _vectordb is None:
        try:
            emb = GoogleGenerativeAIEmbeddings(
                model="models/embedding-001",
                google_api_key=os.getenv("GOOGLE_API_KEY"),
            )
            _vectordb = Chroma.from_documents(
                docs_from_products(load_products()),
                embedding=emb,
                persist_directory="./chroma_products"
            )
            print("[VectorDB] Initialized successfully")
        except Exception as e:
            print(f"[VectorDB] Initialization failed: {e}")
            raise
    return _vectordb

# ---------------- QA Chain ---------------- #
def qa_chain(vdb):
    prompt = PromptTemplate.from_template(
        """
You are a helpful ecommerce assistant. **Answer ONLY from the context**.
If the answer is not in context say:
"I'm sorry, I don't see that information yet."

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

# ---------------- User Management Helper ---------------- #
def get_user_by_email(email: str) -> dict | None:
    """Get user from cache or database"""
    if email in _current_user_cache:
        return _current_user_cache[email]
    
    if db is None:
        print("[WARNING] Database not available, using in-memory storage")
        return None
    
    try:
        user = db["Users"].find_one({"email": email})
        if user:
            _current_user_cache[email] = user
        return user
    except Exception as e:
        print(f"[ERROR] Database query failed: {e}")
        return None

def create_user(email: str) -> dict:
    """Create a new user"""
    user_doc = {"email": email}
    
    if db is not None:
        try:
            db["Users"].insert_one(user_doc.copy())
            print(f"[DB] Created user: {email}")
        except Exception as e:
            print(f"[ERROR] Failed to create user in DB: {e}")
    
    _current_user_cache[email] = user_doc
    return user_doc

def update_user_name(email: str, name: str) -> bool:
    """Update user name"""
    if db is not None:
        try:
            result = db["Users"].update_one(
                {"email": email}, 
                {"$set": {"name": name}}
            )
            if result.modified_count > 0:
                print(f"[DB] Updated name for {email}: {name}")
            else:
                print(f"[DB] No document updated for {email}")
        except Exception as e:
            print(f"[ERROR] Failed to update user name in DB: {e}")
            return False
    
    # Update cache
    if email in _current_user_cache:
        _current_user_cache[email]["name"] = name
    
    return True

# ---------------- Onboarding Tools ---------------- #
@mcp.tool()
def connect_user(email: str) -> str:
    """Connect a user and check if they need to provide their name"""
    try:
        user = get_user_by_email(email)
        
        if user is None:
            # Create new user
            user = create_user(email)
        
        # Check if user has a name
        if "name" not in user or not user.get("name"):
            return (
                f"👋 Hi! I see your email is **{email}**, "
                "but I don't know your name yet. What should I call you?"
            )
        
        return f"Welcome back, **{user['name']}**! How can I help you today?"
    
    except Exception as e:
        print(f"[ERROR] connect_user failed: {e}")
        return f"Hi there! I'm having trouble accessing your information right now, but I can still help you with product questions."

@mcp.tool()
def set_user_name(name: str, email: str) -> str:
    """Set the user's name"""
    try:
        if not name or not name.strip():
            return "Please provide a valid name."
        
        name = name.strip()
        
        # Validate name (basic check)
        if len(name) > 50:
            return "Name is too long. Please provide a shorter name."
        
        success = update_user_name(email, name)
        
        if success:
            return f"Thanks, **{name}**! I've saved your name. How can I help you today?"
        else:
            return f"Thanks, **{name}**! I'll remember that for this session."
    
    except Exception as e:
        print(f"[ERROR] set_user_name failed: {e}")
        return "I had trouble saving your name, but I can still help you with product questions."

# ---------------- Product Tools ---------------- #
@mcp.tool()
def search_products(query: str) -> str:
    """Search for products based on a query"""
    try:
        vdb = get_vectordb()
        matches = vdb.similarity_search(query, k=5)
        
        if not matches:
            return "Sorry, I couldn't find any relevant products for your search."
        
        headers = ["Name", "Category", "Price ₹", "Rating", "Reviews", "Stock"]
        rows = []
        
        for doc in matches:
            p = doc.metadata
            rows.append([
                p.get("name", "N/A"),
                p.get("category", "N/A"),
                f"₹{p.get('price', 'N/A')}",
                p.get("rating", "N/A"),
                p.get("reviews", "N/A"),
                "✅ In Stock" if p.get("inStock", False) else "❌ Out of Stock"
            ])
        
        return "### 🛍️ Product Search Results\n\n" + tabulate(rows, headers, tablefmt="github")
    
    except Exception as e:
        print(f"[ERROR] search_products failed: {e}")
        return "I'm having trouble searching for products right now. Please try again."

@mcp.tool()
def filter_products(category: str = "", min_price: float = 0, max_price: float = 1000000, in_stock_only: bool = False) -> str:
    """Filter products by category, price range, and stock status"""
    try:
        vdb = get_vectordb()
        
        # Build search query
        query_parts = []
        if category:
            query_parts.append(f"{category} products")
        query_parts.append(f"price between {min_price} and {max_price}")
        if in_stock_only:
            query_parts.append("in stock")
        
        query = " ".join(query_parts)
        hits = vdb.similarity_search(query, k=20)
        
        # Filter results
        filtered_results = []
        for hit in hits:
            p = hit.metadata
            price = p.get("price", 0)
            in_stock = p.get("inStock", True)
            
            # Apply filters
            if price < min_price or price > max_price:
                continue
            if in_stock_only and not in_stock:
                continue
            if category and category.lower() not in p.get("category", "").lower():
                continue
            
            filtered_results.append(p)
        
        if not filtered_results:
            return "No products match your filter criteria."
        
        headers = ["Name", "Category", "Price ₹", "Rating", "Stock"]
        rows = []
        
        for p in filtered_results[:10]:  # Limit to top 10
            rows.append([
                p.get("name", "N/A"),
                p.get("category", "N/A"),
                f"₹{p.get('price', 'N/A')}",
                p.get("rating", "N/A"),
                "✅" if p.get("inStock", False) else "❌"
            ])
        
        return f"### 🔍 Filtered Products ({len(filtered_results)} found)\n\n" + tabulate(rows, headers, tablefmt="github")
    
    except Exception as e:
        print(f"[ERROR] filter_products failed: {e}")
        return "I'm having trouble filtering products right now. Please try again."

@mcp.tool()
def compare_products(product_names: list[str]) -> str:
    """Compare multiple products side by side"""
    try:
        if len(product_names) < 2:
            return "Please provide at least 2 product names to compare."
        
        vdb = get_vectordb()
        chosen_products = []
        
        for name in product_names:
            hits = vdb.similarity_search(name, k=1)
            if hits:
                chosen_products.append(hits[0].metadata)
        
        if len(chosen_products) < 2:
            return "I couldn't find enough products to compare. Please check the product names."
        
        headers = ["Product", "Price ₹", "Rating", "Reviews", "Stock", "Category"]
        rows = []
        
        for p in chosen_products:
            rows.append([
                p.get("name", "N/A"),
                f"₹{p.get('price', 'N/A')}",
                p.get("rating", "N/A"),
                p.get("reviews", "N/A"),
                "✅" if p.get("inStock", False) else "❌",
                p.get("category", "N/A")
            ])
        
        return "### ⚖️ Product Comparison\n\n" + tabulate(rows, headers, tablefmt="github")
    
    except Exception as e:
        print(f"[ERROR] compare_products failed: {e}")
        return "I'm having trouble comparing products right now. Please try again."

@mcp.tool()
def check_availability(product_name: str) -> str:
    """Check if a specific product is available"""
    try:
        vdb = get_vectordb()
        hits = vdb.similarity_search(product_name, k=1)
        
        if not hits:
            return f"Sorry, I couldn't find a product named '{product_name}'."
        
        p = hits[0].metadata
        product_name = p.get("name", "Unknown Product")
        price = p.get("price", "N/A")
        in_stock = p.get("inStock", False)
        
        if in_stock:
            return f"✅ **{product_name}** is available for ₹{price}!"
        else:
            return f"❌ Sorry, **{product_name}** is currently out of stock."
    
    except Exception as e:
        print(f"[ERROR] check_availability failed: {e}")
        return "I'm having trouble checking product availability right now. Please try again."

@mcp.tool()
def get_policy_info(topic: str) -> str:
    """Get information about store policies"""
    policies = {
        "return": "📦 **Return Policy**: You can return items within 30 days of purchase in original condition.",
        "refund": "💰 **Refund Policy**: Refunds are processed within 5-7 business days after we receive your return.",
        "shipping": "🚚 **Shipping**: Standard shipping takes 3-5 days, express shipping takes 1-2 days.",
        "warranty": "🛡️ **Warranty**: Most electronics come with a 1-year manufacturer warranty.",
        "exchange": "🔄 **Exchange**: Items can be exchanged within 15 days for size or color changes.",
        "cancellation": "❌ **Cancellation**: Orders can be cancelled within 24 hours of placing them."
    }
    
    topic_lower = topic.lower()
    for key, value in policies.items():
        if key in topic_lower:
            return value
    
    return "I don't have specific information about that policy. Please contact customer support for more details."

@mcp.tool()
def get_product_details(product_name: str) -> str:
    """Get detailed information about a specific product"""
    try:
        vdb = get_vectordb()
        hits = vdb.similarity_search(product_name, k=1)
        
        if not hits:
            return f"Sorry, I couldn't find detailed information about '{product_name}'."
        
        p = hits[0].metadata
        
        details = f"""
### 📱 {p.get('name', 'Unknown Product')}

**Description**: {p.get('description', 'No description available')}
**Category**: {p.get('category', 'N/A')}
**Price**: ₹{p.get('price', 'N/A')}
**Rating**: {p.get('rating', 'N/A')} ⭐
**Reviews**: {p.get('reviews', 'N/A')} customer reviews
**Availability**: {'✅ In Stock' if p.get('inStock', False) else '❌ Out of Stock'}
"""
        
        return details.strip()
    
    except Exception as e:
        print(f"[ERROR] get_product_details failed: {e}")
        return "I'm having trouble getting product details right now. Please try again."

# ---------------- Launch ---------------- #
if __name__ == "__main__":
    print("[ProductAgent] Starting MCP tool server...")
    try:
        # Initialize vector database
        get_vectordb()
        print("[ProductAgent] Vector database initialized")
        mcp.run(transport="stdio")
    except Exception as e:
        print(f"[ERROR] Failed to start ProductAgent: {e}")
        raise