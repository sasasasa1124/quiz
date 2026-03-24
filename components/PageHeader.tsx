"use client";

import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";

interface Props {
  back?: { href: string; label?: string };
  title?: string;
  right?: React.ReactNode;
  hideSettingsIcon?: boolean;
}

function ScholionLogo() {
  return (
    <Link href="/" className="flex items-center gap-2 hover:opacity-75 transition-opacity">
      <span
        className="text-xl font-medium tracking-widest text-scholion-600"
        style={{ fontFamily: "var(--font-cormorant), Georgia, serif", letterSpacing: "0.08em" }}
      >
        Scholion
      </span>
    </Link>
  );
}

export default function PageHeader({ back, title, right, hideSettingsIcon }: Props) {
  return (
    <header className="h-14 bg-canvas border-b border-gray-200 fixed top-0 left-0 right-0 z-40 flex items-center px-4 sm:px-8">
      <div className="flex items-center gap-3 w-full">
        {back ? (
          <Link
            href={back.href}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={14} />
          </Link>
        ) : (
          <ScholionLogo />
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
