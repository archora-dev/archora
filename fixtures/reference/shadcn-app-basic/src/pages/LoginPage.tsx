import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginPage(): JSX.Element {
  const [email, setEmail] = useState('');
  return (
    <Card>
      <CardHeader>
        <h1>Sign in</h1>
      </CardHeader>
      <CardContent>
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button onClick={() => console.log(email)}>Continue</Button>
      </CardContent>
    </Card>
  );
}
