# LinkedIn URL Jobs Scraper

Scrapes job listings from any LinkedIn jobs search URL you provide.

## Features

- ✅ Works with any LinkedIn jobs search URL
- ✅ Automatic pagination (up to 1000 jobs)
- ✅ Extracts all job details (title, company, location, dates, apply URL)
- ✅ Handles rate limiting with proxies
- ✅ Auto-generates apply URLs if missing

## Input
```json
{
  "linkedinUrl": "https://www.linkedin.com/jobs/search/?keywords=Sales&location=France&f_TPR=r86400",
  "maxItems": 1000
}
```

### Parameters:

- **linkedinUrl** (required): Full LinkedIn jobs search URL from your browser
- **maxItems** (optional): Maximum number of jobs to scrape (default: 1000, max: 1000)

## How to use:

1. Go to LinkedIn jobs search: https://www.linkedin.com/jobs/search/
2. Apply your filters (keywords, location, date, experience, etc.)
3. Copy the URL from your browser
4. Paste it in the `linkedinUrl` input field
5. Run the actor!

## Output
```json
{
  "id": "4315226243",
  "title": "Regional Sales Director",
  "company": "Abnormal AI",
  "location": "France",
  "postedTime": "3 hours ago",
  "postedDate": "2025-11-28",
  "applyUrl": "https://www.linkedin.com/jobs/view/...",
  "companyUrl": "https://www.linkedin.com/company/...",
  "benefits": ["Be an early applicant"],
  "scrapedAt": "2025-11-28T16:53:49.206Z"
}
```

## Examples:

**Sales jobs in France (last 24 hours):**
```
https://www.linkedin.com/jobs/search/?keywords=Sales&location=France&f_TPR=r86400
```

**Remote Software Engineer jobs:**
```
https://www.linkedin.com/jobs/search/?keywords=Software%20Engineer&f_WT=2
```

**Entry level Marketing jobs in New York:**
```
https://www.linkedin.com/jobs/search/?keywords=Marketing&location=New%20York&f_E=2
```
