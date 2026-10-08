import Navbar from '@/components/Navbar';
import IntakeQuestions from '@/components/IntakeQuestions';

export const metadata = {
  title: 'Your health questions – Primavera Healthcare',
  description: 'A few questions about your health, so your doctor can prescribe safely.',
  robots: { index: false },
};

export default function HealthQuestionsPage() {
  return (
    <>
      <Navbar />
      <main>
        <div className="pv-page-head">
          <div className="container">
            <div className="pv-page-head-tag">Your order</div>
            <h1 className="pv-page-head-h1">Your health questions</h1>
            <p className="pv-page-head-sub">
              Your doctor reads every answer before prescribing. You only answer these once.
            </p>
          </div>
        </div>
        <div className="pv-quiz-shell">
          <IntakeQuestions />
        </div>
      </main>
    </>
  );
}
