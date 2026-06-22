export interface ProductsRegistry {
  has(id: string): boolean;
}

export const productsRegistry: ProductsRegistry = {
  has: (id) => id.length > 0,
};
