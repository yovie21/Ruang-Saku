// Scroll observer for feature reveals - R-19: animation triggered by viewport entry
export function initScrollObserver() {
  if (typeof window === 'undefined') return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -80px 0px' }
  );

  document.querySelectorAll('.feature-reveal, .close-reveal').forEach((el) => {
    observer.observe(el);
  });
}
