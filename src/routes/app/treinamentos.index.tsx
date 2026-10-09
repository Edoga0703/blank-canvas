import { createFileRoute } from "@tanstack/react-router";
import { AcademiaMetricsHome } from "@/components/training/academy-home";

export const Route = createFileRoute("/app/treinamentos/")({
  component: AcademiaMetricsHome,
});
