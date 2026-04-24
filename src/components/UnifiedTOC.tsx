"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { List, ChevronRight, Hash } from "lucide-react";

interface TOCSection {
  id: string;
  label: string;
  level?: number;
}

interface UnifiedTOCProps {
  /** Optional manual sections. If omitted, will search for headers in the selector. */
  sections?: TOCSection[];
  /** Selector for content to search for headers (e.g., ".article-content") */
  selector?: string;
  /** Title to display */
  title?: string;
}

/**
 * Unified Table of Contents component.
 * Supports both manual section lists and automatic discovery of h2/h3 headers.
 */
export function UnifiedTOC({ sections: manualSections, selector, title = "Table of Contents" }: UnifiedTOCProps) {
  const [discoveredSections, setDiscoveredSections] = useState<TOCSection[]>([]);
  const [activeId, setActiveId] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Derive the active sections: Prefer manual if provided, else discovered
  const sections = manualSections || discoveredSections;

  // Discover sections from the DOM if a selector is provided
  useEffect(() => {
    if (manualSections || !selector) return;

    const content = document.querySelector(selector);
    if (!content) return;

    const headers = content.querySelectorAll("h2, h3");
    const discovered: TOCSection[] = Array.from(headers)
      .map((header) => {
        // Ensure the header has an ID
        if (!header.id) {
          const text = header.textContent || "";
          header.id = text.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");
        }
        return {
          id: header.id,
          label: header.textContent || "",
          level: parseInt(header.tagName.substring(1)),
        };
      })
      .filter(section => {
        const label = section.label.toLowerCase();
        return label !== "overview" && label !== "introduction" && label !== "summary";
      });

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDiscoveredSections(discovered);
  }, [manualSections, selector]);

  // Track active section on scroll
  useEffect(() => {
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-100px 0px -80% 0px" }
    );

    sections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [sections]);

  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 100;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }
    setIsOpen(false);
  }, []);

  if (sections.length === 0) return null;

  return (
    <>
      {/* Desktop Wrapper - Sticky Sidebar (visible on LG and up) */}
      <div className="hidden lg:block w-full">
        <div 
          className="card p-5 border-zinc-800/50"
          style={{ 
            background: "rgba(10, 11, 15, 0.4)", 
            backdropFilter: "blur(16px) saturate(180%)",
          }}
        >
          <div className="flex items-center gap-2 mb-4 text-xs font-bold uppercase tracking-widest text-zinc-400">
            <List size={14} className="text-accent-primary" />
            {title}
          </div>
          <nav className="flex flex-col gap-0.5 pr-2">
            {sections.map((section) => {
              const isActive = activeId === section.id;
              const isH3 = section.level === 3;
              
              return (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`text-left px-3 py-2 rounded-md text-sm transition-all flex items-center gap-2 group relative ${
                    isH3 ? "ml-4" : ""
                  }`}
                  style={{ 
                    color: isActive ? "var(--accent-primary)" : "var(--text-secondary)",
                    background: isActive ? "rgba(217, 119, 6, 0.08)" : "transparent",
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {isActive && (
                    <motion.div 
                      layoutId="toc-indicator"
                      className="absolute left-0 w-1 h-4 bg-accent-primary rounded-full"
                    />
                  )}
                  <span className={`${isActive ? "translate-x-1" : "group-hover:text-white transition-colors group-hover:translate-x-0.5"} transition-transform duration-200 line-clamp-2`}>
                    {section.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Mobile Floating Menu (visible below LG) */}
      <div className="lg:hidden fixed bottom-40 right-8 z-[110]">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              className="mb-4 p-4 shadow-2xl w-64 rounded-2xl border border-zinc-800"
              style={{ 
                background: "rgba(10, 11, 15, 0.95)", 
                backdropFilter: "blur(20px)",
              }}
            >
              <div className="text-xs font-bold uppercase mb-3 text-zinc-500 flex items-center gap-2">
                <Hash size={12} /> {title}
              </div>
              <div className="flex flex-col gap-1 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      section.level === 3 ? "ml-3" : ""
                    }`}
                    style={{ 
                      color: activeId === section.id ? "var(--accent-primary)" : "var(--text-secondary)",
                      background: activeId === section.id ? "rgba(217, 119, 6, 0.1)" : "transparent",
                    }}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-14 h-14 rounded-full bg-accent-primary text-white flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all"
        >
          {isOpen ? <ChevronRight size={24} className="rotate-90" /> : <List size={24} />}
        </button>
      </div>
    </>
  );
}
