import { redirect } from "next/navigation";

/**
 * Personal build: there is no marketing landing page and no signup. The root
 * just opens the app.
 */
export default function Home() {
  redirect("/business");
}
