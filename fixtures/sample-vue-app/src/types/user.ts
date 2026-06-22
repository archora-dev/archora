export interface User {
  id: string;
  name: string;
  role: 'admin' | 'member';
  avatar: string;
  joined: Date;
}
