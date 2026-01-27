import React, { useState } from 'react';

interface Props {
  logo: string;
  name: string;
  color: string;
}

export const InsurerLogo: React.FC<Props> = ({ logo, name, color }) => {
  const [error, setError] = useState(false);
  if (error) {
    return (
      <div className={`w-16 h-16 flex items-center justify-center ${color} rounded-lg`}>
        <span className="text-white font-black text-xs text-center px-1">{name}</span>
      </div>
    );
  }
  return (
    <img
      src={logo}
      alt={name}
      className="w-full h-full object-contain"
      onError={() => setError(true)}
    />
  );
};
