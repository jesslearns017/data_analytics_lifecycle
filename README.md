# Data Analytics Lifecycle

An interactive web application that guides you through the **6-step Data Analytics Lifecycle** — no code required.

> Brought to you by Jessie M. Flores

**Privacy-first**: All data is stored in your browser (IndexedDB). The backend is a stateless compute API — no data is saved on any server.

## The 6 Steps

| Step | Name | Description |
|------|------|-------------|
| 1 | **Define the Goal** | Identify the business problem, scope, and deliverables |
| 2 | **Get the Data** | Upload CSV/Excel, explore columns, stats, correlations |
| 3 | **Clean the Data** | Handle missing values, duplicates, outliers |
| 4 | **Enrich the Data** | Encode categories, scale features, engineer new variables |
| 5 | **Analyze the Data** | Train ML models, visualize results, validate performance |
| 6 | **Deploy Insights** | Generate summary report, visualize and present findings |

## Features

- **Auto-Profiling** — Dataset type detection (classification, regression, time series), column stats, correlation heatmap, missing values chart
- **Smart ETL** — Per-column treatment recommendations with explanations, one-click apply, Health Score (0–100) before/after
- **12 ML Models** — Linear, Polynomial, Decision Tree, Random Forest, Gradient Boosting, Logistic, Naive Bayes, KNN, SVM (regression + classification)
- **Advanced Options** — k-fold cross-validation, auto feature engineering, SMOTE for class imbalance, row sampling for large datasets
- **Feature Selection** — Manual, forward, backward, and lasso methods
- **Per-Model Visuals** — Confusion matrix, ROC curve, predicted vs actual, residuals, feature importance, coefficients table
- **Model Comparison** — Side-by-side metrics table with auto-generated insights
- **Summary Report** — Printable/PDF report with dataset overview, cleaning log, and model results
- **Educational** — LearnBanner cards on every page explaining each lifecycle step

## Stack

- **Backend**: FastAPI (Python 3.11+), pandas, numpy, scikit-learn, imbalanced-learn
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS
- **Charts**: Plotly.js (react-plotly.js)
- **Storage**: IndexedDB (browser-side, ephemeral)

## Quick Start

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Project Structure

```
data-analytics/
├── README.md
├── backend/
│   ├── requirements.txt
│   └── app/
│       ├── main.py                  # FastAPI entry point
│       ├── core/config.py           # App settings
│       ├── api/v1/routes/           # REST endpoints
│       │   ├── profiling.py         # POST /api/v1/profile
│       │   ├── etl.py              # POST /api/v1/etl/plan, /etl/apply
│       │   └── modeling.py          # POST /api/v1/models/train
│       ├── schemas/                 # Pydantic request/response models
│       └── services/               # Business logic
│           ├── profiling_service.py
│           ├── etl_service.py
│           └── modeling_service.py
├── frontend/
│   ├── package.json
│   └── src/
│       ├── App.tsx                  # Routes
│       ├── pages/                   # Upload, Profile, ETL, Model, Report
│       ├── components/              # Reusable UI components
│       ├── api/                     # API client functions
│       ├── storage/db.ts            # IndexedDB layer
│       └── types/index.ts           # TypeScript types
└── .gitignore
```

## Architecture

- **Backend** is stateless — no database, no file storage on server. It receives data, computes results, and returns them.
- **Frontend** uses IndexedDB for ephemeral storage (datasets, profiles, cleaning plans, model runs).
- **API Pattern**: Frontend sends file + config with each request → backend returns results.
- **Deployment**: Render (recommended for full-stack) or Netlify (frontend) + Render (backend).

## Sample Dataset

A sample CSV is included at `backend/app/data/sample/customers.csv` (30 rows, 10 columns, classification with Churn target).
