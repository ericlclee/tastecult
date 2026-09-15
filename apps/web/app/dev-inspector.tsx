'use client';

import { useEffect, useState } from 'react';

// Development-only helper: hovering an element outlines it and labels it with the React
// components it sits inside, so a piece of UI can be named precisely in conversation
// ("LogFeed › LogSocial › button"). Alt+click copies the label; Alt+Shift+I toggles it.

const LABEL_MAX_WIDTH = 720;

interface Fiber {
  type: unknown;
  return: Fiber | null;
}

// Framework and library components that would only add noise to a label — including
// Next.js's dev overlay and any error/suspense boundary, wherever the word appears
const INTERNAL =
  /^(Inner|Outer|Render|Redirect|Error|NotFound|HTTPAccess|Loading|Scroll|AppRouter|AppDev|Router|Head|Hot|Dev|Server|Segment|Client|Metadata|Viewport|Suspense|Fragment|Providers?$|QueryClient|TRPC|ReactDev|Root|Link$|LinkComponent)|Overlay|Boundary/;

function componentName(type: unknown): string | null {
  const candidate =
    typeof type === 'function'
      ? type
      : type && typeof type === 'object'
        ? ((type as { render?: unknown; type?: unknown }).render ??
          (type as { type?: unknown }).type)
        : null;
  if (typeof candidate !== 'function') return null;
  const fn = candidate as { displayName?: string; name?: string };
  return fn.displayName ?? fn.name ?? null;
}

/** The app components an element is rendered by, outermost first (at most three). */
function componentPath(element: Element): string[] {
  const key = Object.keys(element).find((k) => k.startsWith('__reactFiber$'));
  let fiber = key ? (element as unknown as Record<string, Fiber>)[key] : null;
  const names: string[] = [];
  while (fiber && names.length < 3) {
    const name = componentName(fiber.type);
    if (name && /^[A-Z]/.test(name) && !INTERNAL.test(name) && names.at(-1) !== name) {
      names.push(name);
    }
    fiber = fiber.return;
  }
  return names.reverse();
}

function labelFor(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  const snippet = text ? ` "${text.length > 30 ? `${text.slice(0, 30)}…` : text}"` : '';
  return [...componentPath(element), `${tag}${snippet}`].join(' › ');
}

export function DevInspector() {
  const [enabled, setEnabled] = useState(true);
  const [target, setTarget] = useState<{ rect: DOMRect; label: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey && event.shiftKey && event.code === 'KeyI') {
        setEnabled((on) => !on);
        setTarget(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    function onMove(event: MouseEvent) {
      const element = event.target;
      if (!(element instanceof Element)) return;
      setTarget({ rect: element.getBoundingClientRect(), label: labelFor(element) });
    }

    function onClick(event: MouseEvent) {
      if (!event.altKey || !(event.target instanceof Element)) return;
      // Alt+click copies instead of following links or pressing buttons
      event.preventDefault();
      event.stopPropagation();
      navigator.clipboard.writeText(labelFor(event.target)).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        },
        (error: unknown) => console.error('Could not copy the element label:', error),
      );
    }

    const clear = () => setTarget(null);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('mouseleave', clear);
    window.addEventListener('scroll', clear, true);
    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mouseleave', clear);
      window.removeEventListener('scroll', clear, true);
    };
  }, [enabled]);

  if (!enabled || !target) return null;
  const { rect, label } = target;

  // Inline styles because the overlay follows the pointer; it's a dev tool, not app UI
  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          outline: '2px solid #e11d48',
          background: 'rgba(225, 29, 72, 0.08)',
          pointerEvents: 'none',
          zIndex: 2147483646,
        }}
      />
      <div
        style={{
          position: 'fixed',
          // Sits above the element when there's room (anchored by its bottom edge, so a
          // label that wraps onto several lines grows upwards), otherwise below it
          ...(rect.top >= 60
            ? { bottom: window.innerHeight - rect.top + 2 }
            : { top: rect.bottom + 2 }),
          left: Math.max(4, Math.min(rect.left, window.innerWidth - LABEL_MAX_WIDTH - 4)),
          maxWidth: `min(${LABEL_MAX_WIDTH}px, calc(100vw - 8px))`,
          padding: '2px 6px',
          background: '#e11d48',
          color: 'white',
          font: '12px/18px ui-monospace, SFMono-Regular, Menlo, monospace',
          // Long labels wrap rather than being cut off
          whiteSpace: 'normal',
          overflowWrap: 'anywhere',
          borderRadius: 3,
          pointerEvents: 'none',
          zIndex: 2147483647,
        }}
      >
        {copied ? 'Copied!' : label}
      </div>
    </>
  );
}
