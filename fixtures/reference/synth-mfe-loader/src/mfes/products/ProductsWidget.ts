import type { ProductsService } from './productsService';
import type { ProductsFormatter } from './productsFormatter';
import type { ProductsTypes } from './productsTypes';
import type { ProductsRegistry } from './productsRegistry';

export class ProductsWidget {
  constructor(
    private service: ProductsService,
    private formatter: ProductsFormatter,
    private types: ProductsTypes,
    private registry: ProductsRegistry,
  ) {}

  attach(el: HTMLElement): void {
    el.textContent = this.formatter.format(this.service.list());
    void this.types;
    void this.registry;
  }
}
