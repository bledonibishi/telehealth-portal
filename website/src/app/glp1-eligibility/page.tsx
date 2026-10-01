import Navbar from '@/components/Navbar';
import Quiz from '@/components/Quiz';

export const metadata = {
  title: 'GLP-1 Eligibility Assessment – Primavera Healthcare',
  description: 'Complete our 2-minute eligibility quiz to find out if GLP-1 weight management is right for you.',
};

export default function Glp1EligibilityPage() {
  return (
    <>
      <Navbar />
      <main>
        <div className="pv-page-head">
          <div className="container">
            <div className="pv-page-head-tag">GLP-1 Assessment</div>
            <h1 className="pv-page-head-h1">Check your GLP-1 eligibility</h1>
            <p className="pv-page-head-sub">
              A quick 2-minute assessment. Reviewed by a licensed clinician before any prescription is issued.
            </p>
          </div>
        </div>
        <div className="pv-quiz-shell">
          <Quiz product="GLP1" />
        </div>
      </main>
    </>
  );
}
