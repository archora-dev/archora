export interface ProductsService {
  list(): string[];
}

export const productsService: ProductsService = {
  list: () => ['Hammer', 'Nail'],
};
