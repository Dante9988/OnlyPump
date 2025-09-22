import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { 
  HomeIcon, 
  VideoCameraIcon, 
  BeakerIcon, 
  ChatBubbleLeftRightIcon, 
  UserIcon, 
  QuestionMarkCircleIcon, 
  EllipsisVerticalIcon 
} from '@heroicons/react/24/outline';
import Image from 'next/image';

export default function Sidebar() {
  const pathname = usePathname();
  const { connected, publicKey } = useWallet();
  
  const navItems = [
    { name: 'Home', href: '/', icon: HomeIcon },
    { name: 'Explore', href: '/explore', icon: BeakerIcon },
    { name: 'Scan', href: '/scan', icon: VideoCameraIcon },
    { name: 'Trade', href: '/trade', icon: ChatBubbleLeftRightIcon },
    { name: 'Profile', href: connected ? `/profile/${publicKey?.toString()}` : '/profile', icon: UserIcon },
    { name: 'Support', href: 'https://docs.pump.fun', external: true, icon: QuestionMarkCircleIcon },
  ];
  
  return (
    <div className="h-screen flex flex-col bg-base-900 w-[180px] border-r border-base-800 text-base-content">
      {/* Logo */}
      <div className="p-4 flex items-center gap-2">
        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
          <span className="text-white font-bold">O</span>
        </div>
        <span className="font-bold text-lg">OnlyPump</span>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/' && pathname?.startsWith(item.href));
            
            return (
              <li key={item.name}>
                {item.external ? (
                  <a 
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-base-800`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span>{item.name}</span>
                  </a>
                ) : (
                  <Link 
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-base-800 ${
                      isActive ? 'text-primary border-l-4 border-primary pl-3' : ''
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span>{item.name}</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      
      {/* Create coin button */}
      <div className="p-3">
        <Link href="/create" className="btn btn-primary w-full">
          Create coin
        </Link>
      </div>
      
      {/* Creator rewards */}
      <div className="p-3 border-t border-base-800">
        <div className="bg-base-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs opacity-70">Creator Dashboard</span>
            <span className="bg-blue-500 text-white text-xs px-1 rounded">BETA</span>
          </div>
          <Link href="/creator" className="text-sm text-primary hover:underline">
            View your earnings
          </Link>
        </div>
      </div>
      
      {/* Mobile app QR */}
      <div className="p-3 border-t border-base-800">
        <div className="bg-base-800 rounded-lg p-3 relative">
          <button className="absolute top-1 right-1 text-xs opacity-50">×</button>
          <div className="text-center mb-2">OnlyPump app</div>
          <div className="bg-white p-2 rounded-lg mb-2">
            <div className="aspect-square w-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
              QR Code
            </div>
          </div>
          <div className="text-center text-xs opacity-70">Scan to download</div>
          <div className="text-center mt-2">
            <button className="text-xs text-primary">Learn more</button>
          </div>
        </div>
      </div>
    </div>
  );
}