/**
 * Pagination
 *
 * Shared page-number pagination control with a "jump to page" input,
 * used across list pages (Attendees, Cancellations, Campaigns).
 */

import { useState, useEffect, FormEvent } from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

// WHY: caps how many numbered buttons render before collapsing into an
// ellipsis — otherwise a campaign with hundreds of pages would render
// hundreds of buttons.
const MAX_VISIBLE_PAGES = 5;

function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= MAX_VISIBLE_PAGES + 2) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis')[] = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) pages.push('ellipsis');
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < totalPages - 1) pages.push('ellipsis');

  pages.push(totalPages);
  return pages;
}

export default function Pagination({ currentPage, totalPages, onPageChange, disabled }: PaginationProps) {
  const [jumpValue, setJumpValue] = useState('');

  // Clear the jump input whenever the page changes elsewhere (e.g. Next/Previous)
  useEffect(() => {
    setJumpValue('');
  }, [currentPage]);

  if (totalPages <= 1) return null;

  const handleJump = (e: FormEvent) => {
    e.preventDefault();
    const target = Number(jumpValue);
    if (Number.isInteger(target) && target >= 1 && target <= totalPages) {
      onPageChange(target);
    }
    setJumpValue('');
  };

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <nav className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={disabled || currentPage === 1}
        className="btn-secondary rounded-md disabled:opacity-50"
      >
        Previous
      </button>

      <div className="flex items-center -space-x-px">
        {pageNumbers.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`ellipsis-${i}`} className="px-2 text-sm text-gray-500">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              disabled={disabled}
              aria-current={p === currentPage ? 'page' : undefined}
              className={`px-3 py-2 text-sm font-medium border ${
                p === currentPage
                  ? 'z-10 bg-primary-50 border-primary-500 text-primary-600'
                  : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          )
        )}
      </div>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={disabled || currentPage === totalPages}
        className="btn-secondary rounded-md disabled:opacity-50"
      >
        Next
      </button>

      <form onSubmit={handleJump} className="flex items-center gap-1.5 ml-2">
        <label htmlFor="pagination-jump" className="text-sm text-gray-600">
          Go to
        </label>
        <input
          id="pagination-jump"
          type="number"
          min={1}
          max={totalPages}
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value)}
          placeholder={String(currentPage)}
          disabled={disabled}
          className="w-16 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <button type="submit" disabled={disabled || !jumpValue} className="btn-secondary text-sm disabled:opacity-50">
          Go
        </button>
      </form>
    </nav>
  );
}
