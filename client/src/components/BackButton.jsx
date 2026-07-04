import { useNavigate } from "react-router-dom";

export default function BackButton({ fallbackTo = "/", label = "← Back", className = "button-secondary" }) {
  const navigate = useNavigate();

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate(fallbackTo, { replace: true });
  }

  return (
    <button type="button" onClick={handleBack} className={className}>
      {label}
    </button>
  );
}
