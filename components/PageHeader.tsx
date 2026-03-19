"use client";

import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";

interface Props {
  back?: { href: string; label?: string };
  title?: string;
  right?: React.ReactNode;
  hideSettingsIcon?: boolean;
}

function IgnitestLogo() {
  return (
    <Link href="/" className="flex items-center gap-2 hover:opacity-75 transition-opacity">
      <svg viewBox="0 0 36 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-6 w-auto text-gray-700">
        <rect x="0" y="20" width="10" height="28" rx="2" fill="currentColor"/>
        <rect x="13" y="20" width="10" height="28" rx="2" fill="currentColor"/>
        <rect x="26" y="20" width="10" height="28" rx="2" fill="currentColor"/>
        <path d="M18 0C15 5 11 8 11 13C11 15.5 12 17.5 13.5 19C13.5 16 15.5 14 18 13.5C20.5 14 22.5 16 22.5 19C24 17.5 25 15.5 25 13C25 8 21 5 18 0Z" fill="currentColor"/>
      </svg>
      <span className="text-sm font-semibold text-gray-900 tracking-tight">ignitest</span>
    </Link>
  );
}

export default function PageHeader({ back, title, right, hideSettingsIcon }: Props) {
  return (
    <header className="h-14 bg-white border-b border-gray-200 shrink-0 flex items-center px-4 sm:px-8">
      <div className="flex items-center gap-3 w-full">
        {back ? (
          <Link
            href={back.href}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={14} />
          </Link>
        ) : (
          <IgnitestLogo />
        )}
        {title && (
          <>
            <span className="text-gray-200 select-none">·</span>
            <span className="text-sm text-gray-500 font-medium">{title}</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {right}
          {!hideSettingsIcon && (
            <Link
              href="/settings"
              className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Settings"
            >
              <Settings size={14} />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
