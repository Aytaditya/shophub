import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Star, ShoppingCart, Heart } from 'lucide-react';
import { useCart } from '../contexts/CartContext';

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

interface ProductCardProps {
  product: Product;
}

const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { dispatch } = useCart();
  const navigate = useNavigate();
  const discount = product.originalPrice ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100) : 0;

  const addToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Debug logs
    console.log('Add to cart clicked for:', product.name);
    console.log('Product details:', product);
    console.log('Cart dispatch function:', dispatch);
    
    try {
      dispatch({
        type: 'ADD_ITEM',
        payload: {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.image
        }
      });
      
      console.log('Dispatch successful!');
      
      // Optional: Show success message
      // You can add a toast notification here
      
    } catch (error) {
      console.error('Error adding to cart:', error);
    }
  };

  const handleCardClick = () => {
    navigate(`/product/${product.id}`);
  };

  return (
    <motion.div
      whileHover={{ y: -5 }}
      whileTap={{ scale: 0.98 }}
      className="bg-white rounded-xl shadow-lg overflow-hidden cursor-pointer group h-full flex flex-col"
      onClick={handleCardClick}
    >
      {/* Image Container */}
      <div className="relative overflow-hidden flex-shrink-0">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
        />
        
        {/* Discount Badge */}
        {discount > 0 && (
          <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-1 rounded-full text-sm font-semibold">
            -{discount}%
          </div>
        )}
        
        {/* Favorite Button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          <Heart className="h-4 w-4 text-gray-600 hover:text-red-500 transition-colors" />
        </motion.button>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-grow">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-blue-600 font-medium">{product.category}</span>
          <div className="flex items-center space-x-1">
            <Star className="h-4 w-4 text-yellow-400 fill-current" />
            <span className="text-sm text-gray-600">{product.rating}</span>
            <span className="text-sm text-gray-400">({product.reviews})</span>
          </div>
        </div>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 line-clamp-2 min-h-[3.5rem]">{product.name}</h3>
        
        <p className="text-gray-600 text-sm mb-3 line-clamp-2 min-h-[2.5rem] flex-grow">{product.description}</p>

        {/* Price */}
        <div className="flex items-center justify-between mb-3 mt-auto">
          <div className="flex items-center space-x-2">
            <span className="text-xl font-bold text-gray-900">₹{product.price}</span>
            {product.originalPrice && (
              <span className="text-sm text-gray-500 line-through">${product.originalPrice}</span>
            )}
          </div>
          <div className={`text-sm font-medium ${product.inStock ? 'text-green-600' : 'text-red-600'}`}>
            {product.inStock ? 'In Stock' : 'Out of Stock'}
          </div>
        </div>

        {/* Add to Cart Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={addToCart}
          disabled={!product.inStock}
          className={`w-full flex items-center justify-center space-x-2 py-2 px-4 rounded-lg font-medium transition-colors duration-200 flex-shrink-0 ${
            product.inStock
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          <span>{product.inStock ? 'Add to Cart' : 'Out of Stock'}</span>
        </motion.button>
      </div>
    </motion.div>
  );
};

export default ProductCard;