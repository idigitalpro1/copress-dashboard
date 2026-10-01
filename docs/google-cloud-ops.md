# Gemini cloud operations

`/video/ops` uses the existing private Studio session. Its server endpoint performs fixed read-only checks for the Google Video Ed project and sends only a summarized snapshot to Vertex Gemini when an operator selects **Ask Gemini**. It never submits worker jobs, changes IAM, restarts services, publishes clips, or reads raw logs. Private Drive titles and file identifiers are excluded. Unavailable checks remain unavailable rather than reporting an empty queue or healthy service.

## Activation requirements

Google administrator authentication is required to provision a dedicated `satcom-cloud-ops` service account and keyless Workload Identity Federation. Configure `GOOGLE_OPS_WIF_AUDIENCE` and `GOOGLE_OPS_SERVICE_ACCOUNT` in the Vercel environment. No service-account JSON key is supported.

Use the Vercel team issuer `https://oidc.vercel.com/5280menu`, allowed audience `https://vercel.com/5280menu`, subject mapping `google.subject=assertion.sub`, and restrict subjects to `owner:5280menu:project:copress-dashboard:environment:production` (a separately authorized preview subject is required to test previews). Grant federation `roles/iam.workloadIdentityUser` on only the dedicated service account.

The account needs `run.services.get`, `run.jobs.get`, `run.executions.list`, `monitoring.timeSeries.list`, and `aiplatform.endpoints.predict` in the fixed project. Grant `roles/run.invoker` only on `ace-video-tools` and `roles/iam.serviceAccountOpenIdTokenCreator` only on its own service account for the private intake request. Validate exact API permissions and Gemini model availability before declaring activation complete. The configured model matches Video Ed's `gemini-3.5-flash`; this does not establish a successful inference.

## Operational limits

Diagnosis is manual, limited to one request per ten seconds per server instance and 1,200 output tokens. This is not a global billing cap. Snapshots cover two services, the worker job, up to ten executions, one sampled Drive source, the public feed and fifteen minutes of service 5xx counts. A sampled source is not a pending-work count. Zero errors does not prove traffic or successful video processing. No automatic repair or unattended diagnosis is enabled.

At implementation time Google publisher authentication remained pending. Private cloud monitoring, federation and Gemini inference are not verified active.
