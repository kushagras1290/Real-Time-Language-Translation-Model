import React from 'react';

export const Textarea = ({ value, onChange, placeholder, className }) => {
  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`border border-gray-300 p-2 rounded-md w-full ${className}`}
    />
  );
};
