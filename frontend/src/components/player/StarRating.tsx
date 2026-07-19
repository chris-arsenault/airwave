export function StarRating({
  rating,
  onRate,
}: {
  rating: number;
  onRate: (stars: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1 mt-2">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onRate(star)}
          className={`text-lg ${star <= rating ? "text-yellow-400" : "text-white/20"} hover:text-yellow-300 transition-colors`}
        >
          {star <= rating ? "\u2605" : "\u2606"}
        </button>
      ))}
    </div>
  );
}
