import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { Filter, Grid, List, X, Star, DollarSign, Package, Truck } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import InteractiveGrid from '../components/InteractiveGrid';
import FloatingParticles from '../components/FloatingParticles';
import Chatbot from '../components/Chatbot';
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

const Products: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('name');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState({ min: 0, max: 100000 });
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [showInStockOnly, setShowInStockOnly] = useState(false);
  const [showFeaturedOnly, setShowFeaturedOnly] = useState(false);
  const [showDiscountedOnly, setShowDiscountedOnly] = useState(false);

  const categories = [...new Set(productsData.map(product => product.category))];
  const maxPrice = Math.max(...productsData.map(product => product.price));

  useEffect(() => {
    const categoryParam = searchParams.get('category');
    const searchParam = searchParams.get('search');
    
    if (categoryParam) {
      setSelectedCategories([categoryParam]);
    }
    
    if (searchParam) {
      setSearchQuery(searchParam);
    }
  }, [searchParams]);

  const filteredProducts = useMemo(() => {
    let filtered = productsData;

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.category.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by categories
    if (selectedCategories.length > 0) {
      filtered = filtered.filter(product => selectedCategories.includes(product.category));
    }

    // Filter by price range
    filtered = filtered.filter(product => 
      product.price >= priceRange.min && product.price <= priceRange.max
    );

    // Filter by rating
    if (selectedRating > 0) {
      filtered = filtered.filter(product => product.rating >= selectedRating);
    }

    // Filter by stock status
    if (showInStockOnly) {
      filtered = filtered.filter(product => product.inStock);
    }

    // Filter by featured status
    if (showFeaturedOnly) {
      filtered = filtered.filter(product => product.featured);
    }

    // Filter by discount status
    if (showDiscountedOnly) {
      filtered = filtered.filter(product => product.originalPrice && product.originalPrice > product.price);
    }

    // Sort products
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'price-low':
          return a.price - b.price;
        case 'price-high':
          return b.price - a.price;
        case 'rating':
          return b.rating - a.rating;
        case 'reviews':
          return b.reviews - a.reviews;
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return filtered;
  }, [searchQuery, selectedCategories, priceRange, sortBy, selectedRating, showInStockOnly, showFeaturedOnly, showDiscountedOnly]);

  const clearFilters = () => {
    setSelectedCategories([]);
    setPriceRange({ min: 0, max: maxPrice });
    setSearchQuery('');
    setSortBy('name');
    setSelectedRating(0);
    setShowInStockOnly(false);
    setShowFeaturedOnly(false);
    setShowDiscountedOnly(false);
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const activeFiltersCount = selectedCategories.length + 
    (selectedRating > 0 ? 1 : 0) + 
    (showInStockOnly ? 1 : 0) + 
    (showFeaturedOnly ? 1 : 0) + 
    (showDiscountedOnly ? 1 : 0) +
    (priceRange.min > 0 || priceRange.max < maxPrice ? 1 : 0) +
    (searchQuery ? 1 : 0);

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* <InteractiveGrid className="opacity-5" />
      <FloatingParticles className="opacity-5" particleCount={20} /> */}
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Products</h1>
            <p className="text-gray-600 mt-1">
              {filteredProducts.length === productsData.length 
                ? `Showing all ${productsData.length} products`
                : `Found ${filteredProducts.length} of ${productsData.length} products`
              }
            </p>
          </div>
          
          <div className="flex items-center space-x-4 mt-4 sm:mt-0">
            {/* View Mode Toggle */}
            <div className="flex items-center space-x-2 bg-white rounded-lg p-1 shadow-sm">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <Grid className="h-5 w-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <List className="h-5 w-5" />
              </button>
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            >
              <option value="name">Sort by Name</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="rating">Highest Rated</option>
              <option value="reviews">Most Reviewed</option>
            </select>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm relative"
            >
              <Filter className="h-5 w-5" />
              <span>Filters</span>
              {activeFiltersCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Enhanced Filters Sidebar */}
          <motion.div
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: showFilters ? 0 : -300, opacity: showFilters ? 1 : 0 }}
            className={`lg:w-80 bg-white rounded-xl shadow-lg p-6 h-fit sticky top-8 ${
              showFilters ? 'block' : 'hidden lg:block'
            }`}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Filters</h2>
              <div className="flex items-center space-x-2">
                {activeFiltersCount > 0 && (
                  <span className="text-sm text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                    {activeFiltersCount} active
                  </span>
                )}
                <button
                  onClick={clearFilters}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Search Products
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, description..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Categories with Checkboxes */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Categories
              </label>
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {categories.map(category => {
                  const count = productsData.filter(p => p.category === category).length;
                  return (
                    <label key={category} className="flex items-center space-x-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(category)}
                        onChange={() => toggleCategory(category)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="flex-1 text-sm text-gray-700 group-hover:text-gray-900">
                        {category}
                      </span>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                        {count}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Price Range */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Price Range: ${priceRange.min} - ${priceRange.max}
              </label>
              <div className="space-y-4">
                <input
                  type="range"
                  min="0"
                  max={maxPrice}
                  value={priceRange.min}
                  onChange={(e) => setPriceRange(prev => ({ ...prev, min: Number(e.target.value) }))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <input
                  type="range"
                  min="0"
                  max={maxPrice}
                  value={priceRange.max}
                  onChange={(e) => setPriceRange(prev => ({ ...prev, max: Number(e.target.value) }))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={priceRange.min}
                    onChange={(e) => setPriceRange(prev => ({ ...prev, min: Number(e.target.value) }))}
                    placeholder="Min"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-[50px]"
                  />
                  <span className="text-gray-500">-</span>
                  <input
                    type="number"
                    value={priceRange.max}
                    onChange={(e) => setPriceRange(prev => ({ ...prev, max: Number(e.target.value) }))}
                    placeholder="Max"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-[50px]"
                  />
                </div>
              </div>
            </div>

            {/* Rating Filter */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Minimum Rating
              </label>
              <div className="space-y-2">
                {[4, 3, 2, 1].map(rating => (
                  <label key={rating} className="flex items-center space-x-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="rating"
                      checked={selectedRating === rating}
                      onChange={() => setSelectedRating(selectedRating === rating ? 0 : rating)}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <div className="flex items-center space-x-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`h-4 w-4 ${
                            i < rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
                          }`}
                        />
                      ))}
                      <span className="text-sm text-gray-600 ml-1">& up</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Quick Filters */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Quick Filters
              </label>
              <div className="space-y-3">
                <label className="flex items-center space-x-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={showInStockOnly}
                    onChange={(e) => setShowInStockOnly(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <Package className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">
                    In Stock Only
                  </span>
                </label>
                
                <label className="flex items-center space-x-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={showFeaturedOnly}
                    onChange={(e) => setShowFeaturedOnly(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <Star className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">
                    Featured Only
                  </span>
                </label>
                
                <label className="flex items-center space-x-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={showDiscountedOnly}
                    onChange={(e) => setShowDiscountedOnly(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <DollarSign className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">
                    On Sale Only
                  </span>
                </label>
              </div>
            </div>

            {/* Active Filters Summary */}
            {activeFiltersCount > 0 && (
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Active Filters</h3>
                <div className="space-y-2">
                  {selectedCategories.map(category => (
                    <div key={category} className="flex items-center justify-between bg-blue-50 px-3 py-2 rounded-lg">
                      <span className="text-sm text-blue-800">{category}</span>
                      <button
                        onClick={() => toggleCategory(category)}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {searchQuery && (
                    <div className="flex items-center justify-between bg-blue-50 px-3 py-2 rounded-lg">
                      <span className="text-sm text-blue-800">"{searchQuery}"</span>
                      <button
                        onClick={() => setSearchQuery('')}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>

          {/* Products Grid */}
          <div className="flex-1">
            {filteredProducts.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl shadow-lg">
                <Package className="mx-auto h-16 w-16 text-gray-400 mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No products found</h3>
                <p className="text-gray-500 text-lg mb-6">
                  Try adjusting your filters or search terms to find what you're looking for.
                </p>
                <button
                  onClick={clearFilters}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Clear All Filters
                </button>
              </div>
            ) : (
              <div className={`grid gap-6 ${
                viewMode === 'grid' 
                  ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr' 
                  : 'grid-cols-1'
              }`}>
                {filteredProducts.map((product, index) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.05 }}
                    className="h-full"
                  >
                    <ProductCard product={product} />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chatbot Component */}
      {/* <Chatbot /> */}
    </div>
  );
};

export default Products;