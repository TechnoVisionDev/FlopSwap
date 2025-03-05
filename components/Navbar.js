import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { FaBars, FaTimes } from 'react-icons/fa';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="bg-[#212121] border-b border-gray-700 mb-8">
      <div className="container mx-auto px-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center">
          <Image
            src="/navbar-banner.png"
            alt="Faucet Logo"
            width={250} // desired width
            height={10} // desired height
            objectFit="contain"
          />
        </div>
        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center space-x-4">
          <Link href="https://polygonscan.com/address/0xbc23545e7c51c5a0aa7bbbb8b530759e906a0982" 
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-blue-400 text-lg font-ubuntu">
            Contract Address
          </Link>
          <Link
            href="https://flopcoin.net"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-blue-500 text-white px-4 py-2 rounded text-lg font-ubuntu hover:bg-blue-600 hover:text-white"
          >
            Flopcoin.net
          </Link>
        </nav>
        {/* Hamburger icon for mobile */}
        <div className="md:hidden">
          <button onClick={() => setIsOpen(!isOpen)} className="text-white focus:outline-none">
            {isOpen ? <FaTimes size={24} /> : <FaBars size={24} />}
          </button>
        </div>
      </div>
      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-[#212121] border-t border-gray-700">
          <nav className="flex flex-col items-center px-4 py-2 space-y-4">
            <Link href="https://polygonscan.com/address/0xbc23545e7c51c5a0aa7bbbb8b530759e906a0982" 
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-400 text-lg font-ubuntu">
                Contract Address
            </Link>
            <Link legacyBehavior href="https://flopcoin.net">
              <a
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className="w-full text-center hover:bg-blue-600 bg-blue-500 text-white px-4 py-2 rounded text-lg font-ubuntu"
              >
                Flopcoin.net
              </a>
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}