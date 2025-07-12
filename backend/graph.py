from neo4j import GraphDatabase
import json

driver = GraphDatabase.driver("bolt://localhost:7687", auth=("neo4j", "test1234"))

def ingest_products(tx, product):
    tx.run("""
        MERGE (p:Product {name: $name})
        SET p.category = $category,
            p.price = $price,
            p.originalPrice = $originalPrice,
            p.rating = $rating,
            p.reviews = $reviews,
            p.inStock = $inStock,
            p.description = $description,
            p.site = $site,
            p.link = $link
    """, **product)

with open("products.json", "r") as f:
    products = json.load(f)

with driver.session() as session:
    for product in products:
        session.write_transaction(ingest_products, product)
