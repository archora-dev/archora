import { UsersWidget } from './UsersWidget';
import { usersService } from './usersService';
import { usersFormatter } from './usersFormatter';
import { usersTypes } from './usersTypes';

export default {
  mount(el: HTMLElement): void {
    const w = new UsersWidget(usersService, usersFormatter, usersTypes);
    w.attach(el);
  },
};
