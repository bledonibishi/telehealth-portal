import { redirect } from 'next/navigation';

// Help and messages are one place now: the chat, with a way to send a written request and a list of earlier ones.
export default function HelpPage() {
  redirect('/messages');
}
