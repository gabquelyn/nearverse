import { redirect } from "next/navigation";
import Game from "@/components/world/Game";

// NEAR Auth returns to the home page. Hand its reply to /signin, which finishes the step.
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const reply = await searchParams;
  if (reply.code || reply.error) redirect(`/signin?${new URLSearchParams(reply)}`);
  return <Game landing />;
}
