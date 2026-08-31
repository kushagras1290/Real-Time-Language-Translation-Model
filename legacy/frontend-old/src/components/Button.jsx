import React from 'react';
import clsx from 'clsx';

export const Button = ({ children, onClick, variant = 'default', size = 'md', className = '', ...props }) => {
  const baseClasses = "inline-flex items-center justify-center font-medium transition-colors duration-150";
  
  const variants = {
    default: "bg-blue-600 text-white hover:bg-blue-700",
    outline: "border border-gray-300 text-gray-700 hover:bg-gray-100",
    destructive: "bg-red-600 text-white hover:bg-red-700",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-base",
    lg: "px-5 py-3 text-lg",
  };

  return (
    <button
      onClick={onClick}
      className={clsx(baseClasses, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
};
