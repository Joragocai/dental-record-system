// Paired expand/collapse icons use the same outline and visual weight.
export default function ScheduleSizeIcon({ expanded = false }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {expanded ? (
        <>
          <path d="M3 9h6V3" />
          <path d="M21 9h-6V3" />
          <path d="M3 15h6v6" />
          <path d="M21 15h-6v6" />
        </>
      ) : (
        <>
          <path d="M8 3H3v5" />
          <path d="M16 3h5v5" />
          <path d="M3 16v5h5" />
          <path d="M21 16v5h-5" />
        </>
      )}
    </svg>
  );
}
