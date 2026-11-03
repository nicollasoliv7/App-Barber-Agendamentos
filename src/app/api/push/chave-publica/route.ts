import { ok } from "@/lib/api";
import { vapidPublico } from "@/lib/push";

/** Devolve a chave pública VAPID para o cliente registrar a inscrição push. */
export function GET() {
  return ok({ vapidPublicKey: vapidPublico() });
}
