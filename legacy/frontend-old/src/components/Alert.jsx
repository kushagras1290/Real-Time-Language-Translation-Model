import React from 'react';
import clsx from 'clsx';

export const Alert = ({ children, variant = 'default', className = '' }) => {
  const variants = {
    default: "bg-blue-100 text-blue-900",
    destructive: "bg-red-100 text-red-900",
  };

  return (
    <div className={clsx("p-4 rounded-md", variants[variant], className)}>
      {children}
    </div>
  );
};

export const AlertDescription = ({ children }) => {
  return <p className="text-sm">{children}</p>;
};
