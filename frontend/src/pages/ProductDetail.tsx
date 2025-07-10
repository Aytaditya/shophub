import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Star, 
  ShoppingCart, 
  Heart, 
  Share2, 
  Minus, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  RotateCcw
} from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import FloatingParticles from '../components/FloatingParticles';
import productsData from '../data/products.json';

interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  image: string;
  description: string;
  rating: number;
  reviews: number;
  inStock: boolean;
  featured?: boolean;
}

interface Review {
  id: number;
  user: string;
  rating: number;
  comment: string;
  date: string;
  verified: boolean;
}

const ProductDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { dispatch } = useCart();
  
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'description' | 'reviews' | 'specs'>('description');
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [isZooming, setIsZooming] = useState(false);

  useEffect(() => {
    if (id) {
      const foundProduct = productsData.find(p => p.id === parseInt(id));
      setProduct(foundProduct || null);
    }
  }, [id]);

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Product not found</h2>
          <Link
            to="/products"
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <ArrowLeft className="mr-2 h-5 w-5" />
            Back to Products
          </Link>
        </div>
      </div>
    );
  }

  // Generate additional product images (in a real app, these would come from the API)
  const productImages = [
    product.image,
    product.image.replace('w=500', 'w=600'),
    product.image.replace('w=500', 'w=700'),
    product.image.replace('w=500', 'w=800'),
    product.image.replace('w=500', 'w=900'),
  ];

  // Mock reviews data
  const reviews: Review[] = [
    {
      id: 1,
      user: "Sarah Johnson",
      rating: 5,
      comment: "Absolutely love this product! The quality is outstanding and it arrived quickly. Highly recommend!",
      date: "2024-01-15",
      verified: true
    },
    {
      id: 2,
      user: "Mike Chen",
      rating: 4,
      comment: "Great value for money. Works exactly as described. Only minor issue was the packaging could be better.",
      date: "2024-01-10",
      verified: true
    },
    {
      id: 3,
      user: "Emily Davis",
      rating: 5,
      comment: "This exceeded my expectations! The build quality is fantastic and customer service was very helpful.",
      date: "2024-01-08",
      verified: false
    },
    {
      id: 4,
      user: "Alex Rodriguez",
      rating: 4,
      comment: "Solid product overall. Does what it's supposed to do. Shipping was fast and packaging was secure.",
      date: "2024-01-05",
      verified: true
    }
  ];

  const discount = product.originalPrice ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100) : 0;

  const addToCart = () => {
    for (let i = 0; i < quantity; i++) {
      dispatch({
        type: 'ADD_ITEM',
        payload: {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.image
        }
      });
    }
  };

  const nextImage = () => {
    setSelectedImageIndex((prev) => (prev + 1) % productImages.length);
    resetImageZoom();
  };

  const prevImage = () => {
    setSelectedImageIndex((prev) => (prev - 1 + productImages.length) % productImages.length);
    resetImageZoom();
  };

  const zoomIn = () => {
    setImageZoom(prev => Math.min(prev + 0.5, 3));
    setIsZooming(true);
  };

  const zoomOut = () => {
    setImageZoom(prev => Math.max(prev - 0.5, 1));
    if (imageZoom <= 1.5) {
      setImagePosition({ x: 0, y: 0 });
      setIsZooming(false);
    }
  };

  const resetImageZoom = () => {
    setImageZoom(1);
    setImagePosition({ x: 0, y: 0 });
    setIsZooming(false);
  };

  const handleImageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (imageZoom > 1) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 100;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 100;
      setImagePosition({ x: -x, y: -y });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <FloatingParticles className="opacity-5" particleCount={30} />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center space-x-2 text-sm text-gray-600 mb-8">
          <Link to="/" className="hover:text-blue-600 transition-colors">Home</Link>
          <span>/</span>
          <Link to="/products" className="hover:text-blue-600 transition-colors">Products</Link>
          <span>/</span>
          <Link to={`/products?category=${encodeURIComponent(product.category)}`} className="hover:text-blue-600 transition-colors">
            {product.category}
          </Link>
          <span>/</span>
          <span className="text-gray-900">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Image Section */}
          <div className="space-y-4">
            {/* Main Image */}
            <div className="relative bg-white rounded-2xl shadow-lg overflow-hidden">
              {discount > 0 && (
                <div className="absolute top-4 left-4 z-10 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-semibold">
                  -{discount}%
                </div>
              )}

              {/* Zoom Controls */}
              <div className="absolute top-4 right-4 z-10 flex flex-col space-y-2">
                <button
                  onClick={zoomIn}
                  className="p-2 bg-white bg-opacity-80 rounded-full shadow-lg hover:bg-opacity-100 transition-all"
                >
                  <ZoomIn className="h-5 w-5" />
                </button>
                <button
                  onClick={zoomOut}
                  className="p-2 bg-white bg-opacity-80 rounded-full shadow-lg hover:bg-opacity-100 transition-all"
                >
                  <ZoomOut className="h-5 w-5" />
                </button>
                <button
                  onClick={resetImageZoom}
                  className="p-2 bg-white bg-opacity-80 rounded-full shadow-lg hover:bg-opacity-100 transition-all"
                >
                  <RotateCcw className="h-5 w-5" />
                </button>
              </div>

              <div 
                className="relative h-96 lg:h-[500px] overflow-hidden cursor-crosshair"
                onMouseMove={handleImageMouseMove}
              >
                <motion.img
                  key={selectedImageIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  src={productImages[selectedImageIndex]}
                  alt={product.name}
                  className="w-full h-full object-cover transition-transform duration-300"
                  style={{
                    transform: `scale(${imageZoom}) translate(${imagePosition.x}px, ${imagePosition.y}px)`,
                    transformOrigin: 'center'
                  }}
                />
                
                {productImages.length > 1 && (
                  <>
                    <button
                      onClick={prevImage}
                      className="absolute left-4 top-1/2 transform -translate-y-1/2 p-3 bg-white bg-opacity-80 rounded-full shadow-lg hover:bg-opacity-100 transition-all"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </button>
                    <button
                      onClick={nextImage}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 p-3 bg-white bg-opacity-80 rounded-full shadow-lg hover:bg-opacity-100 transition-all"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Image Thumbnails */}
            <div className="flex space-x-3 overflow-x-auto pb-2">
              {productImages.map((image, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setSelectedImageIndex(index);
                    resetImageZoom();
                  }}
                  className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                    selectedImageIndex === index ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <img
                    src={image}
                    alt={`${product.name} ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Product Info Section */}
          <div className="space-y-6">
            {/* Header */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-blue-600 font-medium bg-blue-100 px-3 py-1 rounded-full">
                  {product.category}
                </span>
                <div className="flex items-center space-x-2">
                  <button className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                    <Heart className="h-6 w-6" />
                  </button>
                  <button className="p-2 text-gray-400 hover:text-blue-500 transition-colors">
                    <Share2 className="h-6 w-6" />
                  </button>
                </div>
              </div>
              
              <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">{product.name}</h1>
              
              <div className="flex items-center space-x-4 mb-6">
                <div className="flex items-center space-x-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-5 w-5 ${
                        i < Math.floor(product.rating) ? 'text-yellow-400 fill-current' : 'text-gray-300'
                      }`}
                    />
                  ))}
                  <span className="text-sm text-gray-600 ml-2">
                    {product.rating} ({product.reviews} reviews)
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-4 mb-8">
                <span className="text-4xl font-bold text-gray-900">${product.price}</span>
                {product.originalPrice && (
                  <span className="text-2xl text-gray-500 line-through">${product.originalPrice}</span>
                )}
                <div className={`text-sm font-medium px-3 py-1 rounded-full ${
                  product.inStock ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'
                }`}>
                  {product.inStock ? 'In Stock' : 'Out of Stock'}
                </div>
              </div>
            </div>

            {/* Quantity and Add to Cart */}
            <div className="bg-gray-50 rounded-xl p-6">
              <div className="flex items-center space-x-6 mb-6">
                <span className="text-lg font-medium text-gray-700">Quantity:</span>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="p-2 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    <Minus className="h-5 w-5" />
                  </button>
                  <span className="w-16 text-center text-xl font-medium">{quantity}</span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="p-2 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>
              
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={addToCart}
                disabled={!product.inStock}
                className={`w-full flex items-center justify-center space-x-3 py-4 px-6 rounded-xl text-lg font-medium transition-colors duration-200 ${
                  product.inStock
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                <ShoppingCart className="h-6 w-6" />
                <span>{product.inStock ? `Add ${quantity} to Cart` : 'Out of Stock'}</span>
              </motion.button>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200">
              <nav className="flex space-x-8">
                {[
                  { id: 'description', label: 'Description' },
                  { id: 'reviews', label: `Reviews (${reviews.length})` },
                  { id: 'specs', label: 'Specifications' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`py-3 px-1 border-b-2 font-medium text-lg transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content */}
            <div className="space-y-6">
              {activeTab === 'description' && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <p className="text-gray-700 leading-relaxed text-lg mb-6">{product.description}</p>
                  <div className="space-y-4">
                    <h4 className="text-xl font-semibold text-gray-900">Key Features:</h4>
                    <ul className="list-disc list-inside text-gray-700 space-y-2 text-lg">
                      <li>Premium quality materials and construction</li>
                      <li>Designed for durability and long-lasting performance</li>
                      <li>Easy to use with intuitive controls</li>
                      <li>Backed by manufacturer warranty</li>
                      <li>Eco-friendly and sustainable design</li>
                    </ul>
                  </div>
                </motion.div>
              )}

              {activeTab === 'reviews' && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  {reviews.map((review) => (
                    <div key={review.id} className="border-b border-gray-200 pb-6 last:border-b-0">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <span className="text-lg font-medium text-gray-900">{review.user}</span>
                          {review.verified && (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                              Verified Purchase
                            </span>
                          )}
                        </div>
                        <span className="text-sm text-gray-500">{review.date}</span>
                      </div>
                      <div className="flex items-center space-x-1 mb-3">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-5 w-5 ${
                              i < review.rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-gray-700 text-lg">{review.comment}</p>
                    </div>
                  ))}
                </motion.div>
              )}

              {activeTab === 'specs' && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <span className="font-medium text-gray-900 text-lg">Category:</span>
                        <span className="ml-3 text-gray-700 text-lg">{product.category}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-900 text-lg">SKU:</span>
                        <span className="ml-3 text-gray-700 text-lg">SKU-{product.id.toString().padStart(6, '0')}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-900 text-lg">Weight:</span>
                        <span className="ml-3 text-gray-700 text-lg">2.5 lbs</span>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <span className="font-medium text-gray-900 text-lg">Dimensions:</span>
                        <span className="ml-3 text-gray-700 text-lg">10" x 8" x 6"</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-900 text-lg">Material:</span>
                        <span className="ml-3 text-gray-700 text-lg">Premium Quality</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-900 text-lg">Warranty:</span>
                        <span className="ml-3 text-gray-700 text-lg">1 Year</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* Related Products */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Related Products</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {productsData
              .filter(p => p.category === product.category && p.id !== product.id)
              .slice(0, 4)
              .map((relatedProduct, index) => (
                <motion.div
                  key={relatedProduct.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="bg-white rounded-xl shadow-lg overflow-hidden cursor-pointer group"
                  onClick={() => navigate(`/product/${relatedProduct.id}`)}
                >
                  <img
                    src={relatedProduct.image}
                    alt={relatedProduct.name}
                    className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-2">{relatedProduct.name}</h3>
                    <p className="text-blue-600 font-bold">${relatedProduct.price}</p>
                  </div>
                </motion.div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;