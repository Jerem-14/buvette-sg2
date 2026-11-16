export type IssueProduct = {
  id: string;
  name: string;
  archived?: boolean;
};

export function getAvailableIssueProducts({
  products,
  stock,
  selectedProductIds = [],
  currentProductId,
}: {
  products: ReadonlyArray<IssueProduct>;
  stock: Record<string, { quantity?: number } | undefined>;
  selectedProductIds?: string[];
  currentProductId?: string;
}) {
  const selected = new Set(selectedProductIds.filter(Boolean));

  return products.filter((product) => {
    if (product.archived) return false;
    const available = (stock[product.id]?.quantity ?? 0) > 0;
    return (
      (available && !selected.has(product.id)) ||
      (currentProductId !== undefined && product.id === currentProductId)
    );
  });
}
