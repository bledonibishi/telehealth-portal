import Navbar from '@/components/Navbar';
import Quiz from '@/components/Quiz';

export const metadata = {
  title: 'HRT Eligibility Assessment – Primavera Healthcare',
  description: 'Complete our 5-minute eligibility quiz to find out if HRT is right for you.',
};

export default function HrtEligibilityPage() {
  return (
    <>
      <Navbar />
      <main>
        <div className="pv-page-head">
          <div className="container">
            <div className="pv-page-head-tag">HRT Assessment</div>
            <h1 className="pv-page-head-h1">Check your HRT eligibility</h1>
            <p className="pv-page-head-sub">
              Answer a few quick questions. A licensed doctor reviews every assessment personally.
            </p>
          </div>
        </div>
        <div className="pv-quiz-shell">
          <Quiz product="HRT" />
        </div>
      </main>
    </>
  );
}
