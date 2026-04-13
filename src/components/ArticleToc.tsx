"use client";

import { useEffect, useState } from "react";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function ArticleToc() {
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    // Brief timeout to ensure the article DOM is fully injected 
    const timeout = setTimeout(() => {
      const elements = Array.from(document.querySelectorAll(".article-content h2, .article-content h3"));
      const items: TocItem[] = elements.map(el => ({
        id: el.id,
        text: el.textContent || "",
        level: el.tagName === "H2" ? 2 : 3
      })).filter(item => item.id);
      
      setHeadings(items);

      const observerOptions = {
        root: null,
        rootMargin: "0px 0px -80% 0px",
        threshold: 1.0,
      };

      const observer = new IntersectionObserver((entries) => {
        // Find last intersecting entry
        const visibleEntries = entries.filter(entry => entry.isIntersecting);
        if (visibleEntries.length > 0) {
          setActiveId(visibleEntries[visibleEntries.length - 1].target.id);
        }
      }, observerOptions);

      elements.forEach(el => observer.observe(el));
      
      return () => observer.disconnect();
    }, 100);
    
    return () => clearTimeout(timeout);
  }, []);

  if (headings.length === 0) return null;

  return (
    <div className="article-toc" style={{ 
      paddingLeft: "var(--space-md)", 
      borderLeft: "1px solid var(--border-color)",
      paddingBottom: "var(--space-xl)",
      display: "flex",
      flexDirection: "column"
    }}>
      <h4 style={{ 
        fontSize: "var(--text-xs)", 
        fontWeight: 800, 
        color: "var(--text-muted)", 
        marginBottom: "var(--space-md)", 
        textTransform: "uppercase", 
        letterSpacing: "0.1em" 
      }}>
        On this page
      </h4>
      <nav style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
        {headings.map((h, idx) => (
          <a
            key={idx}
            href={`#${h.id}`}
            data-active={activeId === h.id}
            className="toc-link"
            style={{
              fontSize: h.level === 2 ? "var(--text-sm)" : "calc(var(--text-sm) * 0.9)",
              paddingLeft: h.level === 3 ? "var(--space-md)" : "0",
              color: activeId === h.id ? "var(--accent-primary)" : "var(--text-secondary)",
              fontWeight: activeId === h.id ? 600 : 400,
              textDecoration: "none",
              transition: "all 0.2s ease-in-out",
              position: "relative"
            }}
            onClick={(e) => {
              e.preventDefault();
              const target = document.getElementById(h.id);
              if (target) {
                // Offset calculation (approx nav bar height)
                const y = target.getBoundingClientRect().top + window.pageYOffset - 80;
                window.scrollTo({ top: y, behavior: "smooth" });
                setActiveId(h.id);
              }
            }}
          >
            {h.text}
          </a>
        ))}
      </nav>
      <style dangerouslySetInnerHTML={{__html: `
        .article-toc::-webkit-scrollbar {
          width: 4px;
        }
        .article-toc::-webkit-scrollbar-thumb {
          background-color: var(--border-color);
          border-radius: 4px;
        }
        .toc-link:hover { color: var(--text-primary) !important; }
        .toc-link::before {
           content: '';
           position: absolute;
           left: -17px;
           top: 0;
           width: 2px;
           height: 100%;
           background: var(--accent-primary);
           transform: scaleY(0);
           transform-origin: left;
           transition: transform 0.2s ease;
        }
        .toc-link[data-active="true"]::before {
           transform: scaleY(1);
        }
      `}} />
    </div>
  );
}
