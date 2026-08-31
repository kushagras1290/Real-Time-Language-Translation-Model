import React from 'react';

export const Select = ({ onValueChange, children }) => {
  const handleChange = (e) => {
    onValueChange(e.target.value);
  };

  return (
    <select onChange={handleChange} className="border border-gray-300 p-2 rounded-md w-full">
      {children}
    </select>
  );
};

export const SelectTrigger = ({ children }) => <>{children}</>;
export const SelectContent = ({ children }) => <>{children}</>;
export const SelectItem = ({ children, value }) => (
  <option value={value}>
    {children}
  </option>
);

export const SelectValue = ({ placeholder }) => <option value="">{placeholder}</option>;
