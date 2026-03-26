"""
ShiftSync ML CLI — Train models and run predictions from command line

Usage:
  python ml_cli.py train --business-id 5
  python ml_cli.py train --all
  python ml_cli.py predict --business-id 5 --date 2026-03-30
  python ml_cli.py status
  python ml_cli.py risk --business-id 5 --days 30

Requires: ml_service.py to be importable (same directory)
"""

import argparse
import sys
import os
import json
from datetime import datetime, timedelta

# Add parent dir to path so we can import ml_service
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ml_service import (
    train_model, predict_attendance, model_info,
    attendance_trends, risk_employees,
    query_df, model_store, PredictionRequest,
)


def cmd_train(args):
    """Train model for a specific business or all businesses."""
    if args.all:
        # Get all business IDs
        df = query_df("SELECT DISTINCT business_id FROM businesses WHERE is_active = 1")
        business_ids = df['business_id'].tolist()
        print(f"Training models for {len(business_ids)} businesses...\n")
        for bid in business_ids:
            print(f"─── Business ID: {bid} ───")
            try:
                result = train_model(business_id=bid)
                print(f"  ✅ Trained on {result.samples} samples")
                print(f"  AUC: {result.metrics['auc']} | Accuracy: {result.metrics['accuracy']}")
                print(f"  Top features: {', '.join(f['feature'] for f in result.top_features[:5])}")
            except Exception as e:
                print(f"  ❌ Failed: {e}")
            print()
    else:
        bid = args.business_id
        print(f"Training model for business ID: {bid}...")
        try:
            result = train_model(business_id=bid)
            print(f"\n✅ Model trained successfully!")
            print(f"  Samples: {result.samples}")
            print(f"  AUC: {result.metrics['auc']}")
            print(f"  Accuracy: {(result.metrics['accuracy'] * 100):.1f}%")
            print(f"  Precision: {(result.metrics['precision'] * 100):.1f}%")
            print(f"  Recall: {(result.metrics['recall'] * 100):.1f}%")
            print(f"  F1 Score: {result.metrics['f1']}")
            print(f"\n  Top 10 Features:")
            for i, f in enumerate(result.top_features, 1):
                bar = "█" * int(f['importance'] / max(ft['importance'] for ft in result.top_features) * 30)
                print(f"    {i:2}. {f['feature']:<35} {bar} {f['importance']:.0f}")
        except Exception as e:
            print(f"\n❌ Training failed: {e}")
            sys.exit(1)


def cmd_predict(args):
    """Run attendance predictions for a date."""
    if model_store['model'] is None:
        print("⚠️  No model loaded. Training first...")
        try:
            train_model(business_id=args.business_id)
        except Exception as e:
            print(f"❌ Training failed: {e}")
            sys.exit(1)

    date = args.date or (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
    print(f"\nPredicting attendance for {date} (Business ID: {args.business_id})...\n")

    try:
        req = PredictionRequest(business_id=args.business_id, date=date)
        result = predict_attendance(req)

        print(f"Overall Expected Attendance: {(result.overall_expected_attendance * 100):.1f}%")
        print(f"High Risk Employees: {result.high_risk_count}")
        print(f"Total Scheduled: {len(result.predictions)}\n")

        if result.predictions:
            # Header
            print(f"  {'Employee':<25} {'Role':<12} {'Position':<20} {'Show-Up':<10} {'On-Time':<10} {'Risk':<8}")
            print(f"  {'─'*25} {'─'*12} {'─'*20} {'─'*10} {'─'*10} {'─'*8}")

            for p in result.predictions:
                risk_icon = "🟢" if p.risk_level == "low" else "🟡" if p.risk_level == "medium" else "🔴"
                print(f"  {p.employee_name:<25} {p.role:<12} {p.position:<20} {p.show_up_probability*100:>6.1f}%   {p.on_time_probability*100:>6.1f}%   {risk_icon} {p.risk_level}")
        else:
            print("  No shifts scheduled for this date.")

    except Exception as e:
        print(f"❌ Prediction failed: {e}")
        sys.exit(1)


def cmd_status(args):
    """Show current model status."""
    info = model_info()
    print("\n═══ ML Model Status ═══")
    if info.get('status') == 'trained':
        print(f"  Status: ✅ Trained")
        print(f"  Trained at: {info['trained_at']}")
        print(f"  AUC: {info['metrics']['auc']}")
        print(f"  Accuracy: {(info['metrics']['accuracy'] * 100):.1f}%")
        print(f"  F1 Score: {info['metrics']['f1']}")
        print(f"  Training samples: {info['metrics']['training_samples']}")
        print(f"  Test samples: {info['metrics']['test_samples']}")
    else:
        print(f"  Status: ⚠️  Not trained")
        print(f"  Run: python ml_cli.py train --business-id <ID>")
    print()


def cmd_risk(args):
    """Show at-risk employees."""
    days = args.days or 30
    print(f"\nAt-risk employees (last {days} days, Business ID: {args.business_id})...\n")

    try:
        results = risk_employees(business_id=args.business_id, days=days)

        if not results:
            print("  No data available.")
            return

        print(f"  {'Employee':<25} {'Role':<12} {'Position':<20} {'Shifts':<8} {'Rate':<8} {'No-Shows':<10} {'Late':<6}")
        print(f"  {'─'*25} {'─'*12} {'─'*20} {'─'*8} {'─'*8} {'─'*10} {'─'*6}")

        for emp in results:
            rate = float(emp.get('attendance_rate', 0))
            icon = "🟢" if rate >= 90 else "🟡" if rate >= 80 else "🔴"
            print(f"  {emp['employee_name']:<25} {emp.get('role',''):<12} {emp.get('employee_position',''):<20} {emp['total_shifts']:<8} {icon} {rate:>5.1f}% {emp['no_shows']:<10} {emp['late_count']:<6}")

    except Exception as e:
        print(f"❌ Failed: {e}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="ShiftSync ML CLI")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Train
    train_parser = subparsers.add_parser("train", help="Train the ML model")
    train_parser.add_argument("--business-id", type=int, help="Business ID to train for")
    train_parser.add_argument("--all", action="store_true", help="Train for all businesses")

    # Predict
    predict_parser = subparsers.add_parser("predict", help="Run attendance predictions")
    predict_parser.add_argument("--business-id", type=int, required=True, help="Business ID")
    predict_parser.add_argument("--date", type=str, help="Date to predict (YYYY-MM-DD, default: tomorrow)")

    # Status
    subparsers.add_parser("status", help="Show model status")

    # Risk
    risk_parser = subparsers.add_parser("risk", help="Show at-risk employees")
    risk_parser.add_argument("--business-id", type=int, required=True, help="Business ID")
    risk_parser.add_argument("--days", type=int, default=30, help="Days to look back (default: 30)")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    if args.command == "train":
        if not args.business_id and not args.all:
            print("Error: --business-id or --all is required")
            sys.exit(1)
        cmd_train(args)
    elif args.command == "predict":
        cmd_predict(args)
    elif args.command == "status":
        cmd_status(args)
    elif args.command == "risk":
        cmd_risk(args)


if __name__ == "__main__":
    main()