import Navbar from '@/components/Navbar';
import Quiz from '@/components/Quiz';

export const metadata = {
  title: 'TRT Eligibility Assessment – Primavera Healthcare',
  description: 'Complete our 5-minute eligibility quiz to find out if testosterone replacement therapy is right for you.',
};

export default function TrtEligibilityPage() {
  return (
    <>
      <Navbar />
      <main>
        <div className="pv-page-head">
          <div className="container">
            <div className="pv-page-head-tag">TRT Assessment</div>
            <h1 className="pv-page-head-h1">Check your TRT eligibility</h1>
            <p className="pv-page-head-sub">
              A short assessment, about 5 minutes. Reviewed by a licensed clinician before any prescription is issued.
            </p>
          </div>
        </div>
        <div className="pv-quiz-shell">
          <Quiz product="TRT" />
        </div>
      </main>
    </>
  );
}
