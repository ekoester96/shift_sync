"""
ShiftSync ML Service — FastAPI (PostgreSQL version)
Attendance prediction using LightGBM

Setup:
  pip install fastapi uvicorn lightgbm pandas numpy scikit-learn psycopg2-binary python-dotenv
  
Run:
  uvicorn ml_service:app --host 127.0.0.1 --port 8000 --reload

The Express backend calls this service for predictions.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import pandas as pd
import numpy as np
import lightgbm as lgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score
import psycopg2
import os
import json
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="ShiftSync ML Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Database Connection ──────────────────────────────────────────────────────
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "shiftsync")
DB_USER = os.getenv("DB_USER", "ethan")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

def get_connection():
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
    )

def query_df(sql: str, params=None) -> pd.DataFrame:
    conn = get_connection()
    df = pd.read_sql(sql, conn, params=params)
    conn.close()
    return df


# ─── US Holidays ──────────────────────────────────────────────────────────────
HOLIDAYS = {
    '2024-01-01', '2024-01-15', '2024-02-19', '2024-05-27', '2024-07-04',
    '2024-09-02', '2024-10-14', '2024-11-11', '2024-11-28', '2024-11-29',
    '2024-12-24', '2024-12-25', '2024-12-31',
    '2025-01-01', '2025-01-20', '2025-02-17', '2025-05-26', '2025-07-04',
    '2025-09-01', '2025-10-13', '2025-11-11', '2025-11-27', '2025-11-28',
    '2025-12-24', '2025-12-25', '2025-12-31',
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-07-03',
    '2026-09-07', '2026-11-26', '2026-12-24', '2026-12-25',
}

def is_holiday_adjacent(date_str: str) -> bool:
    d = datetime.strptime(date_str, '%Y-%m-%d')
    for h in HOLIDAYS:
        hd = datetime.strptime(h, '%Y-%m-%d')
        if abs((d - hd).days) <= 1:
            return True
    return False


# ─── Feature Engineering ──────────────────────────────────────────────────────
FEATURE_COLUMNS = [
    'day_of_week', 'month', 'day_of_month', 'is_weekend', 'is_monday', 'is_friday',
    'dow_sin', 'dow_cos', 'month_sin', 'month_cos',
    'start_hour', 'shift_duration_hours', 'is_early_morning', 'is_late_night',
    'is_holiday_adjacent',
    'tenure_days', 'tenure_months', 'is_new_hire',
    'role_encoded', 'hourly_rate',
    'attendance_rate_7d', 'attendance_rate_14d', 'attendance_rate_30d',
    'late_rate_30d',
]

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Transform raw shift data into ML features."""
    df = df.copy()
    
    # Target
    df['showed_up'] = df['attendance_status'].isin(['worked', 'late']).astype(int)
    df['was_late'] = (df['attendance_status'] == 'late').astype(int)
    
    # Date features
    df['shift_date'] = pd.to_datetime(df['start_date'])
    df['day_of_week'] = df['shift_date'].dt.dayofweek
    df['month'] = df['shift_date'].dt.month
    df['day_of_month'] = df['shift_date'].dt.day
    df['is_weekend'] = df['day_of_week'].isin([5, 6]).astype(int)
    df['is_monday'] = (df['day_of_week'] == 0).astype(int)
    df['is_friday'] = (df['day_of_week'] == 4).astype(int)
    
    # Cyclical encoding
    df['dow_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
    df['dow_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
    df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
    df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)
    
    # Time features
    if 'start_hour' not in df.columns:
        df['start_hour'] = pd.to_datetime(df['start_time'].astype(str)).dt.hour
    df['is_early_morning'] = (df['start_hour'] <= 6).astype(int)
    df['is_late_night'] = (df['start_hour'] >= 20).astype(int)
    
    # Duration
    if 'shift_duration_hours' not in df.columns:
        start_dt = pd.to_datetime(df['start_time'].astype(str))
        end_dt = pd.to_datetime(df['end_time'].astype(str))
        df['shift_duration_hours'] = (end_dt - start_dt).dt.total_seconds() / 3600
        df.loc[df['shift_duration_hours'] < 0, 'shift_duration_hours'] += 24

    # Tenure
    df['hire_date'] = pd.to_datetime(df['hire_date'])
    df['tenure_days'] = (df['shift_date'] - df['hire_date']).dt.days
    df['tenure_months'] = df['tenure_days'] / 30.0
    df['is_new_hire'] = (df['tenure_days'] < 90).astype(int)
    
    # Role encoding
    role_map = {'Associate': 0, 'Lead': 1, 'Manager': 2}
    df['role_encoded'] = df['role'].map(role_map).fillna(0)
    
    # Holiday
    if 'is_holiday_adjacent' not in df.columns or df['is_holiday_adjacent'].isna().all():
        df['is_holiday_adjacent'] = df['start_date'].apply(
            lambda x: 1 if is_holiday_adjacent(str(x)[:10]) else 0
        )
    df['is_holiday_adjacent'] = df['is_holiday_adjacent'].fillna(0).astype(int)
    
    # Hourly rate
    df['hourly_rate'] = df['hourly_rate'].fillna(0).astype(float)
    
    # Rolling attendance features (per employee, shifted to avoid leakage)
    df = df.sort_values(['employee_id', 'shift_date'])
    for window in [7, 14, 30]:
        col = f'attendance_rate_{window}d'
        df[col] = df.groupby('employee_id')['showed_up'].transform(
            lambda x: x.rolling(window, min_periods=1).mean().shift(1)
        ).fillna(0.85)
    
    df['late_rate_30d'] = df.groupby('employee_id')['was_late'].transform(
        lambda x: x.rolling(30, min_periods=1).mean().shift(1)
    ).fillna(0.1)
    
    return df


# ─── Model Storage ────────────────────────────────────────────────────────────
model_store = {
    'model': None,
    'trained_at': None,
    'metrics': None,
    'feature_importance': None,
}


# ─── API Models ───────────────────────────────────────────────────────────────
class TrainResponse(BaseModel):
    status: str
    samples: int
    metrics: dict
    top_features: list

class PredictionRequest(BaseModel):
    business_id: int
    date: str  # YYYY-MM-DD
    employee_ids: Optional[List[int]] = None

class EmployeePrediction(BaseModel):
    employee_id: int
    employee_name: str
    role: str
    position: str
    show_up_probability: float
    on_time_probability: float
    risk_level: str  # low, medium, high

class PredictionResponse(BaseModel):
    date: str
    predictions: List[EmployeePrediction]
    overall_expected_attendance: float
    high_risk_count: int


# ─── Endpoints ────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": model_store['model'] is not None,
        "trained_at": model_store['trained_at'],
    }


@app.post("/train", response_model=TrainResponse)
def train_model(business_id: int = 0):
    """Train or retrain the LightGBM attendance model."""
    
    biz_filter = f"AND e.business_id = {business_id}" if business_id > 0 else ""
    
    sql_query = f"""
    SELECT 
        s.shift_id, s.employee_id,
        TO_CHAR(s.start_date, 'YYYY-MM-DD') AS start_date,
        EXTRACT(HOUR FROM s.start_time) AS start_hour,
        EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600.0 AS shift_duration_hours,
        s.position AS shift_position,
        s.attendance_status,
        COALESCE(s.is_holiday_adjacent, false)::int AS is_holiday_adjacent,
        s.start_time, s.end_time,
        e.role, e.employee_position, e.hourly_rate,
        e.hire_date
    FROM shifts s
    JOIN employee e ON s.employee_id = e.employee_id
    WHERE s.attendance_status IS NOT NULL
        AND s.attendance_status != 'scheduled'
        AND s.start_date < CURRENT_DATE
        AND s.employee_id IS NOT NULL
        {biz_filter}
    ORDER BY s.start_date
    """
    
    df = query_df(sql_query)
    
    if len(df) < 100:
        raise HTTPException(status_code=400, detail=f"Not enough training data ({len(df)} rows). Need at least 100.")
    
    # Engineer features
    df = engineer_features(df)
    
    # Prepare X, y
    available_features = [f for f in FEATURE_COLUMNS if f in df.columns]
    X = df[available_features].fillna(0)
    y = df['showed_up']
    
    # Train/test split (time-based)
    split_idx = int(len(df) * 0.8)
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]
    
    # Train LightGBM
    train_data = lgb.Dataset(X_train, label=y_train)
    valid_data = lgb.Dataset(X_test, label=y_test, reference=train_data)
    
    params = {
        'objective': 'binary',
        'metric': 'auc',
        'boosting_type': 'gbdt',
        'num_leaves': 31,
        'learning_rate': 0.05,
        'feature_fraction': 0.8,
        'bagging_fraction': 0.8,
        'bagging_freq': 5,
        'verbose': -1,
    }
    
    model = lgb.train(
        params,
        train_data,
        num_boost_round=200,
        valid_sets=[valid_data],
        callbacks=[lgb.early_stopping(20), lgb.log_evaluation(0)],
    )
    
    # Evaluate
    y_pred = model.predict(X_test)
    y_pred_binary = (y_pred > 0.5).astype(int)
    
    auc = roc_auc_score(y_test, y_pred)
    report = classification_report(y_test, y_pred_binary, output_dict=True)
    
    # Feature importance
    importance = pd.DataFrame({
        'feature': available_features,
        'importance': model.feature_importance(importance_type='gain'),
    }).sort_values('importance', ascending=False)
    
    top_features = importance.head(10).to_dict(orient='records')
    
    # Store model
    model_store['model'] = model
    model_store['trained_at'] = datetime.now().isoformat()
    model_store['metrics'] = {
        'auc': round(auc, 4),
        'accuracy': round(report['accuracy'], 4),
        'precision': round(report['1']['precision'], 4),
        'recall': round(report['1']['recall'], 4),
        'f1': round(report['1']['f1-score'], 4),
        'training_samples': len(X_train),
        'test_samples': len(X_test),
    }
    model_store['feature_importance'] = top_features
    
    return TrainResponse(
        status="trained",
        samples=len(df),
        metrics=model_store['metrics'],
        top_features=top_features,
    )


@app.post("/predict", response_model=PredictionResponse)
def predict_attendance(req: PredictionRequest):
    """Predict attendance for a given date and business."""
    
    if model_store['model'] is None:
        raise HTTPException(status_code=400, detail="Model not trained yet. Call /train first.")
    
    model = model_store['model']
    target_date = req.date
    
    emp_filter = ""
    if req.employee_ids:
        ids_str = ",".join(str(i) for i in req.employee_ids)
        emp_filter = f"AND s.employee_id IN ({ids_str})"
    
    sql_query = f"""
    SELECT 
        s.shift_id, s.employee_id,
        TO_CHAR(s.start_date, 'YYYY-MM-DD') AS start_date,
        EXTRACT(HOUR FROM s.start_time) AS start_hour,
        EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600.0 AS shift_duration_hours,
        s.start_time, s.end_time,
        s.position AS shift_position,
        COALESCE(s.is_holiday_adjacent, false)::int AS is_holiday_adjacent,
        e.employee_name, e.role, e.employee_position, e.hourly_rate, e.hire_date
    FROM shifts s
    JOIN employee e ON s.employee_id = e.employee_id
    WHERE e.business_id = {req.business_id}
        AND TO_CHAR(s.start_date, 'YYYY-MM-DD') = '{target_date}'
        AND s.employee_id IS NOT NULL
        AND s.status != 'cancelled'
        {emp_filter}
    """
    
    df = query_df(sql_query)
    
    if len(df) == 0:
        return PredictionResponse(
            date=target_date,
            predictions=[],
            overall_expected_attendance=0,
            high_risk_count=0,
        )
    
    # We need historical attendance for rolling features
    employee_ids = df['employee_id'].unique().tolist()
    ids_str = ",".join(str(i) for i in employee_ids)
    
    history_sql = f"""
    SELECT s.employee_id,
           TO_CHAR(s.start_date, 'YYYY-MM-DD') AS start_date,
           s.attendance_status, s.start_time, s.end_time,
           e.role, e.hourly_rate, e.hire_date
    FROM shifts s
    JOIN employee e ON s.employee_id = e.employee_id
    WHERE s.employee_id IN ({ids_str})
        AND s.attendance_status IS NOT NULL
        AND s.start_date < '{target_date}'
    ORDER BY s.start_date
    """
    
    history = query_df(history_sql)
    
    # Combine history + target day for feature engineering
    df['attendance_status'] = 'scheduled'
    combined = pd.concat([history, df], ignore_index=True)
    combined = engineer_features(combined)
    
    # Extract only the target date rows
    target_rows = combined[combined['start_date'].astype(str).str[:10] == target_date]
    
    available_features = [f for f in FEATURE_COLUMNS if f in target_rows.columns]
    X_pred = target_rows[available_features].fillna(0)
    
    # Predict
    probs = model.predict(X_pred)
    
    predictions = []
    for idx, (_, row) in enumerate(target_rows.iterrows()):
        prob = float(probs[idx])
        risk = 'low' if prob >= 0.90 else 'medium' if prob >= 0.75 else 'high'
        
        on_time_prob = min(prob * 0.95, 0.99)
        
        predictions.append(EmployeePrediction(
            employee_id=int(row['employee_id']),
            employee_name=str(row.get('employee_name', 'Unknown')),
            role=str(row.get('role', '')),
            position=str(row.get('employee_position', '')),
            show_up_probability=round(prob, 4),
            on_time_probability=round(on_time_prob, 4),
            risk_level=risk,
        ))
    
    predictions.sort(key=lambda p: p.show_up_probability)
    
    overall = float(np.mean(probs))
    high_risk = sum(1 for p in predictions if p.risk_level == 'high')
    
    return PredictionResponse(
        date=target_date,
        predictions=predictions,
        overall_expected_attendance=round(overall, 4),
        high_risk_count=high_risk,
    )


@app.get("/model/info")
def model_info():
    """Get current model info and metrics."""
    if model_store['model'] is None:
        return {"status": "not_trained", "message": "Call POST /train to train the model."}
    
    return {
        "status": "trained",
        "trained_at": model_store['trained_at'],
        "metrics": model_store['metrics'],
        "feature_importance": model_store['feature_importance'],
    }


@app.get("/analytics/attendance-trends")
def attendance_trends(business_id: int, days: int = 30):
    """Get attendance trend data for charting."""
    
    sql_query = f"""
    SELECT 
        TO_CHAR(s.start_date, 'YYYY-MM-DD') AS date,
        COUNT(*) AS total_shifts,
        SUM(CASE WHEN s.attendance_status IN ('worked', 'late') THEN 1 ELSE 0 END) AS showed_up,
        SUM(CASE WHEN s.attendance_status = 'no_show' THEN 1 ELSE 0 END) AS no_shows,
        SUM(CASE WHEN s.attendance_status = 'called_off' THEN 1 ELSE 0 END) AS called_off,
        SUM(CASE WHEN s.attendance_status = 'late' THEN 1 ELSE 0 END) AS late,
        ROUND(SUM(CASE WHEN s.attendance_status IN ('worked', 'late') THEN 1.0 ELSE 0 END) / 
             NULLIF(COUNT(*), 0) * 100, 1) AS attendance_rate
    FROM shifts s
    JOIN employee e ON s.employee_id = e.employee_id
    WHERE e.business_id = {business_id}
        AND s.attendance_status IS NOT NULL
        AND s.start_date >= CURRENT_DATE - INTERVAL '{days} days'
        AND s.start_date < CURRENT_DATE
    GROUP BY s.start_date
    ORDER BY s.start_date
    """
    
    df = query_df(sql_query)
    return df.to_dict(orient='records')


@app.get("/analytics/risk-employees")
def risk_employees(business_id: int, days: int = 30):
    """Get employees ranked by attendance risk."""
    
    sql_query = f"""
    SELECT 
        e.employee_id, e.employee_name, e.role, e.employee_position,
        COUNT(*) AS total_shifts,
        SUM(CASE WHEN s.attendance_status IN ('worked', 'late') THEN 1 ELSE 0 END) AS showed_up,
        SUM(CASE WHEN s.attendance_status = 'no_show' THEN 1 ELSE 0 END) AS no_shows,
        SUM(CASE WHEN s.attendance_status = 'late' THEN 1 ELSE 0 END) AS late_count,
        ROUND(SUM(CASE WHEN s.attendance_status IN ('worked', 'late') THEN 1.0 ELSE 0 END) / 
             NULLIF(COUNT(*), 0) * 100, 1) AS attendance_rate
    FROM shifts s
    JOIN employee e ON s.employee_id = e.employee_id
    WHERE e.business_id = {business_id}
        AND s.attendance_status IS NOT NULL
        AND s.start_date >= CURRENT_DATE - INTERVAL '{days} days'
        AND s.start_date < CURRENT_DATE
    GROUP BY e.employee_id, e.employee_name, e.role, e.employee_position
    HAVING COUNT(*) >= 5
    ORDER BY attendance_rate ASC
    """
    
    df = query_df(sql_query)
    return df.to_dict(orient='records')


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
