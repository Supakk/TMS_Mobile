import { Redirect } from 'expo-router';

import { useSession } from '../src/auth/session';

/** Entry point: send the driver to the first screen that applies. */
export default function Index() {
  const { ready, tenant, session } = useSession();
  if (!ready) return null;
  if (session) return <Redirect href="/home" />;
  if (tenant) return <Redirect href="/login" />;
  return <Redirect href="/company" />;
}
