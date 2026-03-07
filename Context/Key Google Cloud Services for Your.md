Key Google Cloud Services for Your Use Case
For your scenario, the primary Google Cloud component you would interact with is the Google Calendar API. To securely and efficiently connect your local dashboard to this API, you would typically leverage a few other Google Cloud services:

Google Cloud Service	Description	Your Use Case Relevance
Google Calendar API	This API allows applications to view and manage calendar events, calendars, and other calendar-related resources.	This is the core service for interacting with your Google Calendar data (reading events, creating new ones, etc.).
Identity and Access Management (IAM)	IAM lets you manage who has what access to which resources.	Essential for creating a secure service account or setting up OAuth 2.0 to authenticate your local dashboard with the Google Calendar API, ensuring only authorized access to your family's calendar.
Google Cloud Functions (or Cloud Run)	Serverless compute platforms that run your code in response to events.	You could use a small Cloud Function or Cloud Run service as an intermediary. Your local dashboard could call this cloud function, which then interacts with the Google Calendar API. This adds a layer of security, reduces the need to expose API keys directly on your local system, and can handle authentication/authorization securely.
Google Cloud Pub/Sub	A messaging service for asynchronous communication.	If you want real-time updates to your dashboard when a calendar event changes, you could set up push notifications from Google Calendar to a Pub/Sub topic, which would then trigger your Cloud Function to update your dashboard.
Google Secret Manager	Securely stores and manages API keys, passwords, certificates, and other sensitive data.	Recommended for securely storing your API credentials if you choose to deploy a backend service (like Cloud Functions) to handle the API calls.
Tier and Cost Expectations for a Small-Scale Project
For a usage scenario involving 2 adults and a child, the costs associated with these Google Cloud services would likely be very low, potentially even free, due to the generous free tiers offered by Google Cloud.

Here's a breakdown:

Google Calendar API:

The Google Calendar API has a very high free usage limit. For a family of three, even with frequent updates and queries, you would be highly unlikely to exceed the free tier limits. The API usage is typically measured in requests, and personal use cases rarely generate enough traffic to incur charges.
Google Cloud Functions / Cloud Run:

Both services offer a substantial free tier. For Cloud Functions, this includes 2 million invocations per month, 400,000 GB-seconds of memory, 200,000 GHz-seconds of compute time, and 5 GB of egress network data. Cloud Run offers a similar free tier with 2 million requests per month, 360,000 GB-seconds of memory, 180,000 vCPU-seconds of compute time, and 1 GB of egress network data. For a small family dashboard, your usage would almost certainly fall well within these free limits.
Google Cloud Pub/Sub:

Pub/Sub also has a free tier that includes 10 GB of messages per month. For calendar event notifications, this would be more than sufficient.
Google Secret Manager:

The first 6 active secrets are free per month, along with 10,000 access operations per month. Storing your API key here would likely be free.
In summary, for your described usage, it is highly probable that your Google Cloud costs would be negligible, staying well within the free tier limits. You would primarily be leveraging the free access to the Google Calendar API and the free tiers of supporting Google Cloud services.