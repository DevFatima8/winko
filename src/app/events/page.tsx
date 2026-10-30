import type { Metadata } from "next";
import EventsClient from "./Client";

export const metadata: Metadata = { title: "Events | winkox" };

export default function EventsPage() {
  return <EventsClient />;
}
