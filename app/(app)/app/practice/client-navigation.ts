export function navigateTo(
  url: string,
  deps?: {
    assign?: (url: string) => void;
  },
): void {
  const assign =
    deps?.assign ??
    ((nextUrl: string) => {
      window.location.href = nextUrl;
    });

  assign(url);
}
