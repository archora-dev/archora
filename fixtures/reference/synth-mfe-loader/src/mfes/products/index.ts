import { ProductsWidget } from './ProductsWidget';
import { productsService } from './productsService';
import { productsFormatter } from './productsFormatter';
import { productsTypes } from './productsTypes';
import { productsRegistry } from './productsRegistry';

export default {
  mount(el: HTMLElement): void {
    const w = new ProductsWidget(productsService, productsFormatter, productsTypes, productsRegistry);
    w.attach(el);
  },
};
