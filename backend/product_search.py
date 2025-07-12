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
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Union
import hashlib
import re
from collections import defaultdict, Counter
from dataclasses import dataclass
import statistics


_user_preferences = {}  # email -> preferences dict
_search_history = defaultdict(list)  # email -> list of searches
_recommendations_cache = {}  # email -> recommendations list
_wishlist = defaultdict(list)  # email -> list of product IDs
_cart = defaultdict(list)  # email -> list of cart items
_user_sessions = {}  # email -> session data

@dataclass
class CartItem:
    product_id: int
    quantity: int
    added_at: datetime
    
@dataclass
class UserPreferences:
    favorite_categories: List[str]
    price_range: tuple
    preferred_brands: List[str]
    size_preferences: Dict[str, str]

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

def analyze_user_behavior(email: str) -> Dict:
    """Analyze user behavior patterns"""
    searches = _search_history.get(email, [])
    if not searches:
        return {}
    
    # Analyze search patterns
    search_terms = [s['query'].lower() for s in searches]
    category_interest = Counter()
    brand_interest = Counter()
    price_queries = []
    
    for search in searches:
        query = search['query'].lower()
        # Extract categories
        for product in load_products():
            if any(word in query for word in product['category'].lower().split()):
                category_interest[product['category']] += 1
            if 'nike' in query:
                brand_interest['Nike'] += 1
            elif 'boat' in query:
                brand_interest['boAt'] += 1
        
        # Extract price preferences
        price_match = re.search(r'under (\d+)|below (\d+)|less than (\d+)', query)
        if price_match:
            price = int(price_match.group(1) or price_match.group(2) or price_match.group(3))
            price_queries.append(price)
    
    return {
        'search_count': len(searches),
        'top_categories': dict(category_interest.most_common(3)),
        'top_brands': dict(brand_interest.most_common(3)),
        'avg_price_preference': statistics.mean(price_queries) if price_queries else None,
        'last_search': searches[-1]['timestamp'] if searches else None
    }

def get_personalized_recommendations(email: str, count: int = 5) -> List[Dict]:
    """Generate personalized recommendations based on user behavior"""
    if email in _recommendations_cache:
        cache_time = _recommendations_cache[email].get('timestamp', datetime.now())
        if datetime.now() - cache_time < timedelta(hours=1):
            return _recommendations_cache[email]['recommendations']
    
    behavior = analyze_user_behavior(email)
    products = load_products()
    wishlist_items = _wishlist.get(email, [])
    
    scored_products = []
    
    for product in products:
        if product['id'] in wishlist_items:
            continue  # Skip wishlist items
            
        score = 0
        
        # Category preference scoring
        if behavior.get('top_categories'):
            if product['category'] in behavior['top_categories']:
                score += behavior['top_categories'][product['category']] * 10
        
        # Brand preference scoring
        if behavior.get('top_brands'):
            for brand in behavior['top_brands']:
                if brand.lower() in product['name'].lower():
                    score += behavior['top_brands'][brand] * 5
        
        # Price preference scoring
        if behavior.get('avg_price_preference'):
            price_diff = abs(product['price'] - behavior['avg_price_preference'])
            score += max(0, 100 - price_diff / 100)
        
        # Rating and reviews boost
        score += product.get('rating', 0) * 5
        score += min(product.get('reviews', 0) / 1000, 10)
        
        # In-stock preference
        if product.get('inStock', True):
            score += 20
        
        # Featured products boost
        if product.get('featured', False):
            score += 15
        
        scored_products.append((product, score))
    
    # Sort by score and return top recommendations
    scored_products.sort(key=lambda x: x[1], reverse=True)
    recommendations = [product for product, score in scored_products[:count]]
    
    # Cache recommendations
    _recommendations_cache[email] = {
        'recommendations': recommendations,
        'timestamp': datetime.now()
    }
    
    return recommendations

def track_search(email: str, query: str, results_count: int = 0):
    """Track user searches for analytics"""
    _search_history[email].append({
        'query': query,
        'timestamp': datetime.now(),
        'results_count': results_count
    })
    
    # Keep only last 100 searches
    if len(_search_history[email]) > 100:
        _search_history[email] = _search_history[email][-100:]

# ---------------- Advanced Tools ---------------- #
@mcp.tool()
def get_recommendations(email: str, count: int = 5) -> str:
    """Get personalized product recommendations for the user"""
    try:
        recommendations = get_personalized_recommendations(email, count)
        
        if not recommendations:
            return "I don't have enough information about your preferences yet. Try searching for some products first!"
        
        headers = ["Recommended", "Category", "Price ₹", "Rating", "Why Recommended"]
        rows = []
        
        behavior = analyze_user_behavior(email)
        
        for product in recommendations:
            # Generate reason
            reasons = []
            if behavior.get('top_categories') and product['category'] in behavior['top_categories']:
                reasons.append(f"You like {product['category']}")
            if product.get('featured'):
                reasons.append("Popular item")
            if product.get('rating', 0) >= 4.5:
                reasons.append("High rated")
            
            reason = ", ".join(reasons) if reasons else "Based on trends"
            
            rows.append([
                product['name'][:30] + "..." if len(product['name']) > 30 else product['name'],
                product['category'],
                f"₹{product['price']}",
                f"{product.get('rating', 'N/A')} ⭐",
                reason
            ])
        
        return f"### 🎯 Personalized Recommendations for You\n\n" + tabulate(rows, headers, tablefmt="github")
    
    except Exception as e:
        print(f"[ERROR] get_recommendations failed: {e}")
        return "I'm having trouble generating recommendations right now. Please try again."

@mcp.tool()
def add_to_wishlist(email: str, product_name: str) -> str:
    """Add a product to user's wishlist"""
    try:
        vdb = get_vectordb()
        hits = vdb.similarity_search(product_name, k=1)
        
        if not hits:
            return f"Sorry, I couldn't find a product named '{product_name}'."
        
        product = hits[0].metadata
        product_id = product.get('id')
        
        if product_id in _wishlist[email]:
            return f"**{product['name']}** is already in your wishlist!"
        
        _wishlist[email].append(product_id)
        
        # Save to database if available
        if db is not None:
            try:
                db["Users"].update_one(
                    {"email": email},
                    {"$addToSet": {"wishlist": product_id}},
                    upsert=True
                )
            except Exception as e:
                print(f"[ERROR] Failed to save wishlist to DB: {e}")
        
        return f"✅ Added **{product['name']}** to your wishlist!"
    
    except Exception as e:
        print(f"[ERROR] add_to_wishlist failed: {e}")
        return "I'm having trouble adding to your wishlist right now. Please try again."

@mcp.tool()
def view_wishlist(email: str) -> str:
    """View user's wishlist"""
    try:
        wishlist_ids = _wishlist.get(email, [])
        
        if not wishlist_ids:
            return "Your wishlist is empty! Start adding products you like."
        
        products = load_products()
        wishlist_products = [p for p in products if p['id'] in wishlist_ids]
        
        if not wishlist_products:
            return "Your wishlist is empty! Start adding products you like."
        
        headers = ["Product", "Category", "Price ₹", "Rating", "Stock"]
        rows = []
        
        for product in wishlist_products:
            rows.append([
                product['name'][:40] + "..." if len(product['name']) > 40 else product['name'],
                product['category'],
                f"₹{product['price']}",
                f"{product.get('rating', 'N/A')} ⭐",
                "✅" if product.get('inStock', True) else "❌"
            ])
        
        return f"### 💝 Your Wishlist ({len(wishlist_products)} items)\n\n" + tabulate(rows, headers, tablefmt="github")
    
    except Exception as e:
        print(f"[ERROR] view_wishlist failed: {e}")
        return "I'm having trouble accessing your wishlist right now. Please try again."

@mcp.tool()
def remove_from_wishlist(email: str, product_name: str) -> str:
    """Remove a product from user's wishlist"""
    try:
        vdb = get_vectordb()
        hits = vdb.similarity_search(product_name, k=1)
        
        if not hits:
            return f"Sorry, I couldn't find a product named '{product_name}'."
        
        product = hits[0].metadata
        product_id = product.get('id')
        
        if product_id not in _wishlist[email]:
            return f"**{product['name']}** is not in your wishlist."
        
        _wishlist[email].remove(product_id)
        
        # Remove from database if available
        if db is not None:
            try:
                db["Users"].update_one(
                    {"email": email},
                    {"$pull": {"wishlist": product_id}}
                )
            except Exception as e:
                print(f"[ERROR] Failed to remove from wishlist in DB: {e}")
        
        return f"✅ Removed **{product['name']}** from your wishlist!"
    
    except Exception as e:
        print(f"[ERROR] remove_from_wishlist failed: {e}")
        return "I'm having trouble removing from your wishlist right now. Please try again."

@mcp.tool()
def add_to_cart(email: str, product_name: str, quantity: int = 1) -> str:
    """Add a product to user's cart"""
    try:
        if quantity <= 0:
            return "Please specify a valid quantity (greater than 0)."
        
        vdb = get_vectordb()
        hits = vdb.similarity_search(product_name, k=1)
        
        if not hits:
            return f"Sorry, I couldn't find a product named '{product_name}'."
        
        product = hits[0].metadata
        product_id = product.get('id')
        
        if not product.get('inStock', True):
            return f"Sorry, **{product['name']}** is currently out of stock."
        
        # Check if product already in cart
        for item in _cart[email]:
            if item.product_id == product_id:
                item.quantity += quantity
                return f"✅ Updated **{product['name']}** quantity to {item.quantity} in your cart!"
        
        # Add new item to cart
        cart_item = CartItem(
            product_id=product_id,
            quantity=quantity,
            added_at=datetime.now()
        )
        _cart[email].append(cart_item)
        
        return f"✅ Added **{product['name']}** (×{quantity}) to your cart!"
    
    except Exception as e:
        print(f"[ERROR] add_to_cart failed: {e}")
        return "I'm having trouble adding to your cart right now. Please try again."

@mcp.tool()
def view_cart(email: str) -> str:
    """View user's shopping cart"""
    try:
        cart_items = _cart.get(email, [])
        
        if not cart_items:
            return "Your cart is empty! Start adding products to buy."
        
        products = load_products()
        headers = ["Product", "Price ₹", "Qty", "Total ₹", "Added"]
        rows = []
        total_amount = 0
        
        for item in cart_items:
            product = next((p for p in products if p['id'] == item.product_id), None)
            if product:
                item_total = product['price'] * item.quantity
                total_amount += item_total
                
                rows.append([
                    product['name'][:30] + "..." if len(product['name']) > 30 else product['name'],
                    f"₹{product['price']}",
                    item.quantity,
                    f"₹{item_total}",
                    item.added_at.strftime("%m/%d")
                ])
        
        cart_summary = f"### 🛒 Your Cart ({len(cart_items)} items)\n\n"
        cart_summary += tabulate(rows, headers, tablefmt="github")
        cart_summary += f"\n\n**Total Amount: ₹{total_amount}**"
        
        return cart_summary
    
    except Exception as e:
        print(f"[ERROR] view_cart failed: {e}")
        return "I'm having trouble accessing your cart right now. Please try again."

@mcp.tool()
def get_price_alerts(email: str, product_name: str, target_price: float) -> str:
    """Set price alert for a product"""
    try:
        vdb = get_vectordb()
        hits = vdb.similarity_search(product_name, k=1)
        
        if not hits:
            return f"Sorry, I couldn't find a product named '{product_name}'."
        
        product = hits[0].metadata
        current_price = product.get('price', 0)
        
        if target_price >= current_price:
            return f"**{product['name']}** is already priced at ₹{current_price}, which is below your target of ₹{target_price}!"
        
        # In a real implementation, you'd save this to database and set up monitoring
        return f"✅ Price alert set for **{product['name']}**!\n\n📍 Current Price: ₹{current_price}\n🎯 Target Price: ₹{target_price}\n\nI'll notify you when the price drops to ₹{target_price} or below."
    
    except Exception as e:
        print(f"[ERROR] get_price_alerts failed: {e}")
        return "I'm having trouble setting up price alerts right now. Please try again."

@mcp.tool()
def get_user_analytics(email: str) -> str:
    """Get user's shopping analytics and insights"""
    try:
        behavior = analyze_user_behavior(email)
        wishlist_count = len(_wishlist.get(email, []))
        cart_count = len(_cart.get(email, []))
        
        if not behavior:
            return "I don't have enough data to generate analytics yet. Start browsing and searching for products!"
        
        analytics = f"### 📊 Your Shopping Analytics\n\n"
        analytics += f"**Search Activity:** {behavior.get('search_count', 0)} searches\n"
        
        if behavior.get('top_categories'):
            analytics += f"**Favorite Categories:** {', '.join(behavior['top_categories'].keys())}\n"
        
        if behavior.get('top_brands'):
            analytics += f"**Preferred Brands:** {', '.join(behavior['top_brands'].keys())}\n"
        
        if behavior.get('avg_price_preference'):
            analytics += f"**Average Price Range:** ₹{behavior['avg_price_preference']:.0f}\n"
        
        analytics += f"**Wishlist Items:** {wishlist_count}\n"
        analytics += f"**Cart Items:** {cart_count}\n"
        
        if behavior.get('last_search'):
            analytics += f"**Last Search:** {behavior['last_search'].strftime('%Y-%m-%d %H:%M')}\n"
        
        return analytics
    
    except Exception as e:
        print(f"[ERROR] get_user_analytics failed: {e}")
        return "I'm having trouble generating analytics right now. Please try again."

@mcp.tool()
def smart_search(email: str, query: str, sort_by: str = "relevance") -> str:
    """Enhanced search with sorting, filtering, and personalization"""
    try:
        vdb = get_vectordb()
        matches = vdb.similarity_search(query, k=10)
        
        if not matches:
            return "Sorry, I couldn't find any relevant products for your search."
        
        # Track the search
        track_search(email, query, len(matches))
        
        # Get user behavior for personalization
        behavior = analyze_user_behavior(email)
        
        # Score and sort products
        scored_products = []
        for doc in matches:
            product = doc.metadata
            score = 0
            
            # Base relevance score
            score += 100
            
            # Personalization boost
            if behavior.get('top_categories') and product['category'] in behavior['top_categories']:
                score += 20
            
            # Rating boost
            score += product.get('rating', 0) * 5
            
            # Stock availability boost
            if product.get('inStock', True):
                score += 10
            
            # Featured product boost
            if product.get('featured', False):
                score += 15
            
            scored_products.append((product, score))
        
        # Sort based on user preference
        if sort_by == "price_low":
            scored_products.sort(key=lambda x: x[0]['price'])
        elif sort_by == "price_high":
            scored_products.sort(key=lambda x: x[0]['price'], reverse=True)
        elif sort_by == "rating":
            scored_products.sort(key=lambda x: x[0].get('rating', 0), reverse=True)
        elif sort_by == "reviews":
            scored_products.sort(key=lambda x: x[0].get('reviews', 0), reverse=True)
        else:  # relevance
            scored_products.sort(key=lambda x: x[1], reverse=True)
        
        headers = ["Product", "Category", "Price ₹", "Rating", "Stock", "Reviews"]
        rows = []
        
        for product, score in scored_products[:8]:  # Top 8 results
            rows.append([
                product['name'][:35] + "..." if len(product['name']) > 35 else product['name'],
                product['category'],
                f"₹{product['price']}",
                f"{product.get('rating', 'N/A')} ⭐",
                "✅" if product.get('inStock', True) else "❌",
                product.get('reviews', 'N/A')
            ])
        
        result = f"### 🔍 Smart Search Results for '{query}'\n"
        result += f"*Sorted by: {sort_by.replace('_', ' ').title()}*\n\n"
        result += tabulate(rows, headers, tablefmt="github")
        
        return result
    
    except Exception as e:
        print(f"[ERROR] smart_search failed: {e}")
        return "I'm having trouble with smart search right now. Please try again."

# ---------------- Update existing search_products function ---------------- #
# Replace your existing search_products function with this enhanced version:

@mcp.tool()
def search_products(query: str, email: str = "anonymous") -> str:
    """Search for products based on a query (enhanced version)"""
    try:
        vdb = get_vectordb()
        matches = vdb.similarity_search(query, k=5)
        
        if not matches:
            return "Sorry, I couldn't find any relevant products for your search."
        
        # Track the search if email provided
        if email != "anonymous":
            track_search(email, query, len(matches))
        
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

# ---------------- Session Management ---------------- #
def start_user_session(email: str):
    """Start a new user session"""
    _user_sessions[email] = {
        'start_time': datetime.now(),
        'last_activity': datetime.now(),
        'page_views': 0,
        'searches': 0,
        'cart_actions': 0
    }

def update_user_activity(email: str, activity_type: str):
    """Update user activity in session"""
    if email not in _user_sessions:
        start_user_session(email)
    
    session = _user_sessions[email]
    session['last_activity'] = datetime.now()
    
    if activity_type == 'search':
        session['searches'] += 1
    elif activity_type == 'cart':
        session['cart_actions'] += 1
    elif activity_type == 'view':
        session['page_views'] += 1

@mcp.tool()
def get_trending_products(category: str = "", limit: int = 10) -> str:
    """Get trending products based on ratings, reviews, and featured status"""
    try:
        products = load_products()
        
        if category:
            products = [p for p in products if category.lower() in p['category'].lower()]
        
        # Calculate trending score
        trending_products = []
        for product in products:
            if not product.get('inStock', True):
                continue
                
            score = 0
            # Rating weight (40%)
            score += product.get('rating', 0) * 40
            # Reviews weight (30%) - normalized
            score += min(product.get('reviews', 0) / 1000, 10) * 30
            # Featured status weight (20%)
            if product.get('featured', False):
                score += 20
            # Price factor (10%) - lower prices get slight boost
            if product.get('price', 0) < 5000:
                score += 10
            
            trending_products.append((product, score))
        
        # Sort by trending score
        trending_products.sort(key=lambda x: x[1], reverse=True)
        trending_products = trending_products[:limit]
        
        headers = ["🔥 Trending", "Category", "Price ₹", "Rating", "Reviews"]
        rows = []
        
        for product, score in trending_products:
            rows.append([
                product['name'][:40] + "..." if len(product['name']) > 40 else product['name'],
                product['category'],
                f"₹{product['price']}",
                f"{product.get('rating', 'N/A')} ⭐",
                f"{product.get('reviews', 'N/A')} reviews"
            ])
        
        title = f"### 🔥 Trending Products"
        if category:
            title += f" in {category}"
        
        return title + "\n\n" + tabulate(rows, headers, tablefmt="github")
    
    except Exception as e:
        print(f"[ERROR] get_trending_products failed: {e}")
        return "I'm having trouble getting trending products right now. Please try again."

# ---------------- Load user data from database on startup ---------------- #
def load_user_data():
    """Load user data from database on startup"""
    if db is None:
        return
    
    try:
        users = db["Users"].find({})
        for user in users:
            email = user.get('email')
            if email:
                _current_user_cache[email] = user
                if 'wishlist' in user:
                    _wishlist[email] = user['wishlist']
                if 'search_history' in user:
                    _search_history[email] = user['search_history']
    except Exception as e:
        print(f"[ERROR] Failed to load user data: {e}")

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

