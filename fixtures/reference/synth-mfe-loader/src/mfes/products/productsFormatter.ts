export interface ProductsFormatter {
  format(items: string[]): string;
}

export const productsFormatter: ProductsFormatter = {
  format: (items) => items.join(' / '),
};
