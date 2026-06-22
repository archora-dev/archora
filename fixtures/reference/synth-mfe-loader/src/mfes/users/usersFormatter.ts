export interface UsersFormatter {
  format(items: string[]): string;
}

export const usersFormatter: UsersFormatter = {
  format: (items) => items.join(', '),
};
