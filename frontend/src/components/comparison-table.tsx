import type React from "react"

interface ComparisonProduct {
  name: string
  price?: number | string
  rating?: number | string
  reviews?: number | string
  inStock?: boolean
  category?: string
  [key: string]: any // For additional dynamic properties
}

interface ComparisonTableProps {
  products: ComparisonProduct[]
  className?: string
}

const ComparisonTable: React.FC<ComparisonTableProps> = ({ products, className = "" }) => {
  if (!products || products.length === 0) return null

  // Extract all unique keys from all products to create table headers
  const allKeys = new Set<string>()
  products.forEach((product) => {
    Object.keys(product).forEach((key) => allKeys.add(key))
  })

  // Define the order of columns we want to display
  const columnOrder = ["name", "price", "rating", "reviews", "inStock", "category"]
  const otherKeys = Array.from(allKeys).filter((key) => !columnOrder.includes(key))
  const orderedKeys = [...columnOrder.filter((key) => allKeys.has(key)), ...otherKeys]

  // Format header names
  const formatHeader = (key: string): string => {
    const headerMap: { [key: string]: string } = {
      name: "Product",
      price: "Price",
      rating: "Rating",
      reviews: "Reviews",
      inStock: "Stock Status",
      category: "Category",
    }
    return headerMap[key] || key.charAt(0).toUpperCase() + key.slice(1)
  }

  // Format cell values
  const formatValue = (key: string, value: any): string => {
    if (value === null || value === undefined) return "-"

    switch (key) {
      case "price":
        return typeof value === "number" ? `₹${value.toLocaleString()}` : `₹${value}`
      case "inStock":
        return value ? "In Stock" : "Out of Stock"
      case "rating":
        return `${value}/5`
      case "reviews":
        return typeof value === "number" ? value.toLocaleString() : value.toString()
      default:
        return value.toString()
    }
  }

  // Get cell styling based on key and value
  const getCellStyle = (key: string, value: any): string => {
    const baseStyle = "px-4 py-3 text-sm border-b border-gray-200"

    switch (key) {
      case "price":
        return `${baseStyle} font-semibold text-green-700`
      case "inStock":
        return `${baseStyle} ${value ? "text-green-600" : "text-red-600"} font-medium`
      case "rating":
        return `${baseStyle} text-yellow-600 font-medium`
      case "name":
        return `${baseStyle} font-semibold text-gray-900`
      default:
        return `${baseStyle} text-gray-700`
    }
  }

  return (
    <div className={`w-full overflow-x-auto bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            {orderedKeys.map((key) => (
              <th
                key={key}
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200"
              >
                {formatHeader(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {products.map((product, index) => (
            <tr key={index} className="hover:bg-gray-50 transition-colors">
              {orderedKeys.map((key) => (
                <td key={key} className={getCellStyle(key, product[key])}>
                  {formatValue(key, product[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ComparisonTable
