import type { UsersService } from './usersService';
import type { UsersFormatter } from './usersFormatter';
import type { UsersTypes } from './usersTypes';

export class UsersWidget {
  constructor(
    private service: UsersService,
    private formatter: UsersFormatter,
    private types: UsersTypes,
  ) {}

  attach(el: HTMLElement): void {
    el.textContent = this.formatter.format(this.service.list());
    void this.types;
  }
}
