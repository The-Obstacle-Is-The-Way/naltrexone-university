'use client';

import {
  BarChart2,
  Building2,
  CreditCard,
  Folder,
  HelpCircle,
  Home,
  Menu,
  MessagesSquare,
  Receipt,
  Settings,
  Shield,
  Users2,
  Video,
  Wallet,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

interface NavItemProps {
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  children: React.ReactNode;
  onClick?: () => void;
}

function NavItem({ href, icon: Icon, children, onClick }: NavItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center px-3 py-2 text-sm rounded-md transition-colors text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#1F1F23] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2 dark:focus-visible:ring-[#2B2B30]"
    >
      <Icon aria-hidden="true" className="h-4 w-4 mr-3 flex-shrink-0" />
      {children}
    </Link>
  );
}

export default function Sidebar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  function handleNavigation() {
    setIsMobileMenuOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="lg:hidden fixed top-4 left-4 z-[70] p-2 rounded-lg bg-white dark:bg-[#0F0F12] shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2 dark:focus-visible:ring-[#2B2B30]"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isMobileMenuOpen}
        aria-controls="kokonutui-sidebar"
      >
        <Menu
          aria-hidden="true"
          className="h-5 w-5 text-gray-600 dark:text-gray-300"
        />
      </button>
      <nav
        id="kokonutui-sidebar"
        className={`
                fixed inset-y-0 left-0 z-[70] w-64 bg-white dark:bg-[#0F0F12] transform transition-transform duration-200 ease-in-out
                lg:translate-x-0 lg:static lg:w-64 border-r border-gray-200 dark:border-[#1F1F23]
                ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
            `}
      >
        <div className="h-full flex flex-col">
          <Link
            href="https://kokonutui.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="h-16 px-6 flex items-center border-b border-gray-200 dark:border-[#1F1F23] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2 dark:focus-visible:ring-[#2B2B30]"
          >
            <div className="flex items-center gap-3">
              <Image
                src="https://kokonutui.com/logo.svg"
                alt="Acme"
                width={32}
                height={32}
                className="flex-shrink-0 hidden dark:block"
              />
              <Image
                src="https://kokonutui.com/logo-black.svg"
                alt="Acme"
                width={32}
                height={32}
                className="flex-shrink-0 block dark:hidden"
              />
              <span className="text-lg font-semibold hover:cursor-pointer text-gray-900 dark:text-white">
                KokonutUI
              </span>
            </div>
          </Link>

          <div className="flex-1 overflow-y-auto py-4 px-4">
            <div className="space-y-6">
              <div>
                <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Overview
                </div>
                <div className="space-y-1">
                  <NavItem href="#" icon={Home} onClick={handleNavigation}>
                    Dashboard
                  </NavItem>
                  <NavItem href="#" icon={BarChart2} onClick={handleNavigation}>
                    Analytics
                  </NavItem>
                  <NavItem href="#" icon={Building2} onClick={handleNavigation}>
                    Organization
                  </NavItem>
                  <NavItem href="#" icon={Folder} onClick={handleNavigation}>
                    Projects
                  </NavItem>
                </div>
              </div>

              <div>
                <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Finance
                </div>
                <div className="space-y-1">
                  <NavItem href="#" icon={Wallet} onClick={handleNavigation}>
                    Transactions
                  </NavItem>
                  <NavItem href="#" icon={Receipt} onClick={handleNavigation}>
                    Invoices
                  </NavItem>
                  <NavItem
                    href="#"
                    icon={CreditCard}
                    onClick={handleNavigation}
                  >
                    Payments
                  </NavItem>
                </div>
              </div>

              <div>
                <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Team
                </div>
                <div className="space-y-1">
                  <NavItem href="#" icon={Users2} onClick={handleNavigation}>
                    Members
                  </NavItem>
                  <NavItem href="#" icon={Shield} onClick={handleNavigation}>
                    Permissions
                  </NavItem>
                  <NavItem
                    href="#"
                    icon={MessagesSquare}
                    onClick={handleNavigation}
                  >
                    Chat
                  </NavItem>
                  <NavItem href="#" icon={Video} onClick={handleNavigation}>
                    Meetings
                  </NavItem>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-4 border-t border-gray-200 dark:border-[#1F1F23]">
            <div className="space-y-1">
              <NavItem href="#" icon={Settings} onClick={handleNavigation}>
                Settings
              </NavItem>
              <NavItem href="#" icon={HelpCircle} onClick={handleNavigation}>
                Help
              </NavItem>
            </div>
          </div>
        </div>
      </nav>

      {isMobileMenuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 bg-black bg-opacity-50 z-[65] lg:hidden border-none cursor-default"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </>
  );
}
